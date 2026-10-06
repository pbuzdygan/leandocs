import type { Dirent } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { AppError } from '../errors.js';
import { ASSETS_SUFFIX, isDocumentFileName } from '../filesystem/file-name.js';
import { toRelativePath } from '../filesystem/safe-path.js';

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
