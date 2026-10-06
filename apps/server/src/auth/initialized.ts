import {
  closeSync,
  constants,
  fsyncSync,
  fstatSync,
  openSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import type Database from 'better-sqlite3';

export const AUTH_INITIALIZED_FILE = 'auth.initialized';
const MARKER = 'leandocs-auth-initialized:v1\n';
export class AuthenticationRecoveryError extends Error {}

/** Persistent evidence outside SQLite; an invalid marker must never become fresh setup. */
export function hasAuthInitialization(systemDir: string): boolean {
  let descriptor: number;
  try {
    descriptor = openSync(
      path.join(systemDir, AUTH_INITIALIZED_FILE),
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw new AuthenticationRecoveryError(
      'Authentication initialization marker is unreadable. Restore the matching system backup.',
    );
  }
  try {
    const stat = fstatSync(descriptor);
    if (
      !stat.isFile() ||
      stat.size !== Buffer.byteLength(MARKER) ||
      (stat.mode & 0o077) !== 0 ||
      readFileSync(descriptor, 'utf8') !== MARKER
    )
      throw new AuthenticationRecoveryError(
        'Authentication initialization marker is invalid. Restore the matching system backup.',
      );
    return true;
  } finally {
    closeSync(descriptor);
  }
}

export class AuthInitialization {
  constructor(
    private readonly db: Database.Database,
    private readonly systemDir: string,
  ) {
    this.assertState();
    if (this.accountExists()) this.record(); // Adopt existing installations before opening the API.
  }
  private accountExists() {
    return !!this.db.prepare('SELECT id FROM users WHERE id = 1').get();
  }
  assertState(): void {
    if (hasAuthInitialization(this.systemDir) && !this.accountExists())
      throw new AuthenticationRecoveryError(
        'Previously initialized authentication is missing. Restore the matching system backup; setup remains closed.',
      );
  }
  /** Must complete before the account INSERT. A failed/crashed insertion leaves setup closed. */
  record(): void {
    if (hasAuthInitialization(this.systemDir)) return;
    const filename = path.join(this.systemDir, AUTH_INITIALIZED_FILE);
    let descriptor: number;
    try {
      descriptor = openSync(
        filename,
        constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
        0o600,
      );
    } catch (error) {
      if (
        (error as NodeJS.ErrnoException).code === 'EEXIST' &&
        hasAuthInitialization(this.systemDir)
      )
        return;
      throw error;
    }
    try {
      writeFileSync(descriptor, MARKER);
      fsyncSync(descriptor);
    } finally {
      closeSync(descriptor);
    }
    const directory = openSync(this.systemDir, constants.O_RDONLY | constants.O_DIRECTORY);
    try {
      fsyncSync(directory);
    } finally {
      closeSync(directory);
    }
  }
}
