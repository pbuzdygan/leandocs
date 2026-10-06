import { constants } from 'node:fs';
import { access, mkdir } from 'node:fs/promises';
import path from 'node:path';

export interface DataDirs {
  /** Documents, folders, assets, `_templates`, `_trash` (PROJECT_SPEC §77). */
  contentDir: string;
  /** Application state: SQLite index, settings, sessions. Never document content. */
  systemDir: string;
}

export class DataDirError extends Error {}

/** Creates `<dataDir>/content` and `<dataDir>/system` and verifies both are writable. */
export async function ensureDataDirs(dataDir: string): Promise<DataDirs> {
  const dirs: DataDirs = {
    contentDir: path.join(dataDir, 'content'),
    systemDir: path.join(dataDir, 'system'),
  };
  for (const dir of [dirs.contentDir, dirs.systemDir]) {
    try {
      await mkdir(dir, { recursive: true });
      await access(dir, constants.R_OK | constants.W_OK);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new DataDirError(
        `Data directory ${dir} is not usable (needs read/write access): ${reason}`,
      );
    }
  }
  return dirs;
}
