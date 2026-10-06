import { mkdir, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { AppError } from '../errors.js';

/**
 * Security-critical: every user-supplied path goes through this module (PROJECT_SPEC §10, §52).
 * Relative paths always use `/` separators and are relative to the content root.
 */

export class UnsafePathError extends AppError {
  constructor(reason: string) {
    super(400, 'UNSAFE_PATH', `Unsafe path: ${reason}`);
  }
}

/**
 * Validates a user-supplied relative path and returns it normalised (`a/b/c`, no leading or
 * trailing slash). The empty string denotes the content root.
 */
export function normalizeRelativePath(input: string): string {
  if (typeof input !== 'string') throw new UnsafePathError('not a string');
  if (input.includes('\0')) throw new UnsafePathError('contains NUL');
  if (input.includes('\\')) throw new UnsafePathError('contains a backslash');
  if (input.startsWith('/') || /^[a-zA-Z]:/.test(input)) {
    throw new UnsafePathError('absolute paths are not allowed');
  }
  const trimmed = input.replace(/\/+$/, '');
  if (trimmed === '' || trimmed === '.') return '';
  const segments = trimmed.split('/');
  for (const segment of segments) {
    if (segment === '' || segment === '.' || segment === '..') {
      throw new UnsafePathError('empty, "." or ".." segments are not allowed');
    }
  }
  return segments.join('/');
}

/** Resolves a validated relative path to an absolute path that is lexically inside `root`. */
export function resolveInsideRoot(root: string, relativePath: string): string {
  const normalized = normalizeRelativePath(relativePath);
  const absolute = path.resolve(root, normalized);
  if (!isInside(root, absolute)) throw new UnsafePathError('escapes the content root');
  return absolute;
}

/**
 * Resolves an existing directory and verifies that, after following symlinks, it is still inside
 * the content root. Throws 404 FOLDER_NOT_FOUND when it does not exist or is not a directory.
 */
export async function resolveExistingDirectory(
  root: string,
  relativePath: string,
): Promise<string> {
  const absolute = resolveInsideRoot(root, relativePath);
  let real: string;
  try {
    real = await realpath(absolute);
    if (!(await stat(real)).isDirectory()) throw new Error('not a directory');
  } catch {
    throw new AppError(404, 'FOLDER_NOT_FOUND', `Folder not found: ${relativePath || '/'}`);
  }
  const realRoot = await realpath(root);
  if (!isInside(realRoot, real)) throw new UnsafePathError('resolves outside the content root');
  return absolute;
}

/**
 * Like resolveExistingDirectory, but creates missing folders one segment at a time. Every existing
 * ancestor is verified first, so a symlink can never redirect the creation outside the root.
 * `validateNewSegment` is called for each folder that has to be created.
 */
export async function ensureDirectory(
  root: string,
  relativePath: string,
  validateNewSegment: (segment: string) => void,
): Promise<string> {
  const normalized = normalizeRelativePath(relativePath);
  let current = '';
  for (const segment of normalized === '' ? [] : normalized.split('/')) {
    const next = current === '' ? segment : `${current}/${segment}`;
    const absolute = resolveInsideRoot(root, next);
    const exists = await stat(absolute).then(
      () => true,
      () => false,
    );
    if (exists) {
      await resolveExistingDirectory(root, next);
    } else {
      await resolveExistingDirectory(root, current);
      validateNewSegment(segment);
      await mkdir(absolute).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'EEXIST') throw error;
      });
    }
    current = next;
  }
  return resolveExistingDirectory(root, normalized);
}

/** Converts an absolute path inside `root` to a `/`-separated relative path. */
export function toRelativePath(root: string, absolute: string): string {
  return path.relative(root, absolute).split(path.sep).join('/');
}

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}
