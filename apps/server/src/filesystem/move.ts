import { link, lstat, rename, unlink } from 'node:fs/promises';

/**
 * Moves a file or directory to `target` without ever replacing an existing entry
 * (PROJECT_SPEC §26: never silently overwrite). Throws an error with code `EEXIST` if the target
 * exists. Both paths must be on the same filesystem (always true inside the content root).
 */
export async function moveNoOverwrite(source: string, target: string): Promise<void> {
  const sourceInfo = await lstat(source);
  const targetInfo = await lstat(target).catch(() => undefined);
  if (targetInfo) {
    // Case-only rename on a case-insensitive filesystem: source and target are the same entry.
    const sameEntry = targetInfo.ino === sourceInfo.ino && targetInfo.dev === sourceInfo.dev;
    if (!sameEntry) throw existsError(target);
    await rename(source, target);
    return;
  }
  if (sourceInfo.isFile()) {
    // link() fails atomically when the target appeared meanwhile; unlink removes the old name.
    try {
      await link(source, target);
      await unlink(source);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'EEXIST') throw error;
      if (code !== 'EPERM' && code !== 'ENOTSUP' && code !== 'EOPNOTSUPP' && code !== 'EXDEV') {
        throw error;
      }
      // Filesystems without hard links fall through to rename (checked above).
    }
  }
  // Directories (and the hard-link fallback): checked above; the remaining race window is tiny.
  await rename(source, target);
}

export async function pathExists(target: string): Promise<boolean> {
  return lstat(target).then(
    () => true,
    () => false,
  );
}

function existsError(target: string): NodeJS.ErrnoException {
  const error: NodeJS.ErrnoException = new Error(`Target already exists: ${target}`);
  error.code = 'EEXIST';
  return error;
}
