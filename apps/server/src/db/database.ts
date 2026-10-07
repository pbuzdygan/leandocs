import {
  accessSync,
  closeSync,
  constants,
  fstatSync,
  openSync,
  readSync,
  lstatSync,
  readdirSync,
} from 'node:fs';
import { hasAuthInitialization } from '../auth/initialized.js';
import path from 'node:path';
import Database from 'better-sqlite3';
import { migrate } from './migrations.js';

export const DATABASE_FILE = 'app.db';
export class DatabaseRecoveryError extends Error {}
const recoveryError = () =>
  new DatabaseRecoveryError(
    'Application database is missing, invalid or corrupt. Startup stopped to preserve authentication. Restore the matching system backup; do not delete app.db or reset setup.',
  );

export class DatabaseAccessError extends Error {}

/**
 * SQLite cannot migrate a database it may not write, and it creates `-wal`/`-shm` with the
 * database file's permissions: a failed start on a read-only `app.db` would leave read-only
 * sidecars that keep blocking after `app.db` is fixed. Check before SQLite touches anything
 * (P15-06). A read-only volume (EROFS) is reported the same way.
 */
function assertWritable(systemDir: string, file: string): void {
  const blocked = [systemDir, file, `${file}-wal`, `${file}-shm`].filter((candidate) => {
    try {
      accessSync(candidate, constants.W_OK);
      return false;
    } catch (error) {
      return (error as NodeJS.ErrnoException).code !== 'ENOENT';
    }
  });
  if (blocked.length > 0)
    throw new DatabaseAccessError(
      `LeanDocs may not write ${blocked
        .map((candidate) =>
          candidate === systemDir ? 'the system folder' : path.basename(candidate),
        )
        .join(
          ', ',
        )} in ${systemDir}. Give the user LeanDocs runs as write access to every file in that folder (for example chown -R to LEANDOCS_UID:LEANDOCS_GID). Nothing was changed.`,
    );
}

export interface DatabaseLogger {
  info(obj: object, msg: string): void;
  warn(obj: object, msg: string): void;
}

// The file is not a database, or it is damaged beyond use.
const UNUSABLE_CODES = new Set(['SQLITE_NOTADB', 'SQLITE_CORRUPT']);

function isUnusable(error: unknown): boolean {
  return (
    error instanceof Database.SqliteError &&
    [...UNUSABLE_CODES].some((code) => error.code.startsWith(code))
  );
}

function openAndMigrate(
  file: string,
  logger: DatabaseLogger,
  existing: boolean,
): Database.Database {
  const db = new Database(file, { fileMustExist: existing });
  try {
    if (existing && db.pragma('quick_check', { simple: true }) !== 'ok') throw recoveryError();
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.pragma('foreign_keys = ON');
    db.pragma('busy_timeout = 5000');
    const result = migrate(db);
    if (result.applied.length > 0)
      logger.info({ file, from: result.from, to: result.to, applied: result.applied }, 'Migrated');
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

/** Auth and settings are durable app data; never replace an unreadable database (ADR-0019). */
export function openDatabase(systemDir: string, logger: DatabaseLogger): Database.Database {
  const file = path.join(systemDir, DATABASE_FILE);
  let existing = false;
  try {
    const stat = lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size === 0) throw recoveryError();
    const descriptor = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const header = Buffer.alloc(16);
      if (
        !fstatSync(descriptor).isFile() ||
        readSync(descriptor, header, 0, 16, 0) !== 16 ||
        !header.equals(Buffer.from('SQLite format 3\0'))
      )
        throw recoveryError();
    } finally {
      closeSync(descriptor);
    }
    existing = true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    const artifacts = readdirSync(systemDir);
    if (
      hasAuthInitialization(systemDir) ||
      artifacts.some(
        (name) =>
          name === 'mfa.key' ||
          name === 'app.db-wal' ||
          name === 'app.db-shm' ||
          name.startsWith('app.db.corrupt-'),
      )
    )
      throw recoveryError();
  }
  assertWritable(systemDir, file);
  try {
    return openAndMigrate(file, logger, existing);
  } catch (error) {
    if (isUnusable(error)) throw recoveryError();
    throw error;
  }
}
