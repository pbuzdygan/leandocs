import { lstat, readdir } from 'node:fs/promises';
import path from 'node:path';
import { ASSETS_SUFFIX } from './file-name.js';

/**
 * Total size of the files inside `*.assets` folders under `contentDir` (UI_SPEC §86).
 * Like the scanner, dot-entries are skipped and symlinks are not followed; unreadable entries count 0.
 */
export async function attachmentsSize(contentDir: string): Promise<number> {
  let total = 0;
  const walk = async (dir: string, inAssets: boolean): Promise<void> => {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory())
        await walk(full, inAssets || entry.name.toLowerCase().endsWith(ASSETS_SUFFIX));
      else if (inAssets && entry.isFile())
        total += (await lstat(full).catch(() => undefined))?.size ?? 0;
    }
  };
  await walk(contentDir, false);
  return total;
}

/** Size of a SQLite database including its WAL and shared-memory files. */
export async function databaseSize(file: string): Promise<number> {
  let total = 0;
  for (const suffix of ['', '-wal', '-shm'])
    total += (await lstat(file + suffix).catch(() => undefined))?.size ?? 0;
  return total;
}
