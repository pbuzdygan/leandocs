import type { Dirent } from 'node:fs';
import { lstat, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
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
 * - symlinks are not followed (no escapes from the content root, no cycles).
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
  const result: ScanResult = { folders: [], files: [] };
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
  const result: ScanResult & { roots: string[] } = { folders: [], files: [], roots: [] };
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

async function walk(root: string, dir: string, result: ScanResult): Promise<void> {
  let entries: Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    // A folder removed during the scan is not an error.
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  const parentRelative = toRelativePath(root, dir);
  for (const entry of entries) {
    const absolutePath = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (isHiddenEntry(entry.name, parentRelative, entry.isDirectory())) continue;
    if (entry.isDirectory()) {
      result.folders.push(toRelativePath(root, absolutePath));
      await walk(root, absolutePath, result);
    } else if (entry.isFile() && isDocumentFileName(entry.name)) {
      try {
        const info = await stat(absolutePath);
        result.files.push({
          path: toRelativePath(root, absolutePath),
          absolutePath,
          mtimeMs: info.mtimeMs,
          size: info.size,
          birthtimeMs: info.birthtimeMs,
        });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
  }
}
