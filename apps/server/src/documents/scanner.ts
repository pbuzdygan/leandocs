import { isUtf8 } from 'node:buffer';
import type { Dirent } from 'node:fs';
import { lstat, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import type { ScanIssue } from '@leandocs/shared';
import { AppError } from '../errors.js';
import { ASSETS_SUFFIX, isDocumentFileName } from '../filesystem/file-name.js';
import {
  normalizeRelativePath,
  resolveInsideRoot,
  toRelativePath,
} from '../filesystem/safe-path.js';

/**
 * Walks the content directory (PROJECT_SPEC §11–13).
 *
 * - dot-entries (`.git`, editor temp files) are ignored;
 * - `_`-prefixed folders at the content root (`_templates`, `_trash`) are system folders and hidden;
 * - `*.assets` folders hold attachments and are not navigation folders;
 * - only `*.md` files are documents;
 * - symlinks are not followed (no escapes from the content root, no cycles);
 * - a folder that cannot be listed, or a name that is not UTF-8, is reported as an issue instead
 *   of failing the whole scan (P15-03).
 */

export interface ScannedFile {
  path: string;
  absolutePath: string;
  mtimeMs: number;
  size: number;
  birthtimeMs: number;
}

export interface ScanResult {
  folders: string[];
  files: ScannedFile[];
  /** Folders and names the scan had to skip (`UNREADABLE_FOLDER`, `INVALID_FILE_NAME`). */
  issues: ScanIssue[];
}

export function isHiddenEntry(name: string, parentRelative: string, isDirectory: boolean): boolean {
  if (name.startsWith('.')) return true;
  if (isDirectory && parentRelative === '' && name.startsWith('_')) return true;
  if (isDirectory && name.toLowerCase().endsWith(ASSETS_SUFFIX)) return true;
  return false;
}

/**
 * Throws 400 INVALID_FOLDER unless every segment of `folder` is a visible navigation folder
 * (not `.hidden`, not a root `_system` folder, not `*.assets`).
 */
export function assertVisiblePath(folder: string): void {
  if (folder === '') return;
  const segments = folder.split('/');
  segments.forEach((segment, index) => {
    if (isHiddenEntry(segment, segments.slice(0, index).join('/'), true)) {
      throw new AppError(400, 'INVALID_FOLDER', `"${folder}" is not a documentation folder`);
    }
  });
}

export async function scanContent(contentDir: string): Promise<ScanResult> {
  const result: ScanResult = { folders: [], files: [], issues: [] };
  await walk(contentDir, contentDir, result);
  // Code-point order: deterministic across locales (duplicate-id resolution depends on it).
  result.folders.sort();
  result.files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return result;
}

/** Reconcile event paths against disk; missing/unsafe ancestors invalidate their whole subtree. */
export async function scanContentPaths(
  contentDir: string,
  paths: readonly string[],
): Promise<ScanResult & { roots: string[] }> {
  const result: ScanResult & { roots: string[] } = {
    folders: [],
    files: [],
    issues: [],
    roots: [],
  };
  const requested = [...new Set(paths.map(normalizeRelativePath))].sort();
  for (const requestedPath of requested) {
    if (result.roots.some((root) => containsPath(root, requestedPath))) continue;
    if (requestedPath === '') return { ...(await scanContent(contentDir)), roots: [''] };
    const segments = requestedPath.split('/');
    let relative = '';
    for (let index = 0; index < segments.length; index++) {
      const name = segments[index]!;
      const parent = relative;
      relative = parent ? `${parent}/${name}` : name;
      const absolute = resolveInsideRoot(contentDir, relative);
      const info = await lstat(absolute).catch((error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return undefined;
        throw error;
      });
      const last = index === segments.length - 1;
      if (
        !info ||
        info.isSymbolicLink() ||
        isHiddenEntry(name, parent, info.isDirectory()) ||
        (!last && !info.isDirectory())
      ) {
        result.roots.push(relative);
        break;
      }
      if (info.isDirectory()) {
        result.folders.push(relative);
        if (last) {
          result.roots.push(relative);
          await walk(contentDir, absolute, result);
        }
      } else if (last) {
        result.roots.push(relative);
        if (info.isFile() && isDocumentFileName(name))
          result.files.push({
            path: relative,
            absolutePath: absolute,
            mtimeMs: info.mtimeMs,
            size: info.size,
            birthtimeMs: info.birthtimeMs,
          });
      }
    }
  }
  result.roots = result.roots.filter(
    (root, index, all) =>
      !all.some(
        (other, otherIndex) =>
          otherIndex !== index &&
          containsPath(other, root) &&
          (other !== root || otherIndex < index),
      ),
  );
  result.folders = [...new Set(result.folders)].sort();
  result.files = [...new Map(result.files.map((file) => [file.path, file])).values()].sort(
    (a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0),
  );
  return result;
}

export function containsPath(root: string, candidate: string): boolean {
  return root === '' || root === candidate || candidate.startsWith(`${root}/`);
}

/** Files stat'ed concurrently while walking one folder. */
const STAT_BATCH = 32;

async function walk(root: string, dir: string, result: ScanResult): Promise<void> {
  const parentRelative = toRelativePath(root, dir);
  let entries: Dirent<Buffer>[];
  try {
    // Raw names: a name that is not UTF-8 could not be opened through its decoded string.
    entries = await readdir(dir, { withFileTypes: true, encoding: 'buffer' });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    // A folder removed during the scan is not an error.
    if (code === 'ENOENT') return;
    // One folder without read permission must not hide the rest of the library.
    if ((code === 'EACCES' || code === 'EPERM') && parentRelative !== '') {
      result.issues.push({
        code: 'UNREADABLE_FOLDER',
        path: parentRelative,
        message: 'LeanDocs is not allowed to read this folder; its documents are not listed',
      });
      return;
    }
    throw error;
  }
  const documents: { absolutePath: string; relative: string }[] = [];
  const folders: string[] = [];
  for (const entry of entries) {
    const name = entry.name.toString('utf8');
    if (!isUtf8(entry.name)) {
      if (
        !isHiddenEntry(name, parentRelative, entry.isDirectory()) &&
        (entry.isDirectory() || (entry.isFile() && isDocumentFileName(name)))
      )
        result.issues.push({
          code: 'INVALID_FILE_NAME',
          path: parentRelative ? `${parentRelative}/${name}` : name,
          message: `The ${entry.isDirectory() ? 'folder' : 'file'} name is not valid UTF-8 text; rename it to show it`,
        });
      continue;
    }
    const absolutePath = path.join(dir, name);
    if (entry.isSymbolicLink()) continue;
    if (isHiddenEntry(name, parentRelative, entry.isDirectory())) continue;
    if (entry.isDirectory()) folders.push(absolutePath);
    else if (entry.isFile() && isDocumentFileName(name))
      documents.push({ absolutePath, relative: toRelativePath(root, absolutePath) });
  }
  // One stat at a time made a full scan of 10,000 documents take ~270 ms (P15-07); a few in
  // flight keep the thread pool busy without queuing thousands of requests at once.
  for (let start = 0; start < documents.length; start += STAT_BATCH) {
    const batch = documents.slice(start, start + STAT_BATCH);
    const infos = await Promise.all(
      batch.map(({ absolutePath }) =>
        stat(absolutePath).catch((error: NodeJS.ErrnoException) => {
          if (error.code === 'ENOENT') return undefined;
          throw error;
        }),
      ),
    );
    batch.forEach(({ absolutePath, relative }, index) => {
      const info = infos[index];
      if (info)
        result.files.push({
          path: relative,
          absolutePath,
          mtimeMs: info.mtimeMs,
          size: info.size,
          birthtimeMs: info.birthtimeMs,
        });
    });
  }
  for (const absolutePath of folders) {
    result.folders.push(toRelativePath(root, absolutePath));
    await walk(root, absolutePath, result);
  }
}
