import { randomBytes, timingSafeEqual } from 'node:crypto';
import { constants } from 'node:fs';
import { open, rm } from 'node:fs/promises';
import path from 'node:path';
import type Database from 'better-sqlite3';
import {
  validateSetup,
  type SetupRequest,
  type SetupResult,
  type SetupStatus,
} from '@leandocs/shared';
import { AppError } from '../errors.js';
import { hashPassword } from './password.js';
import type { AuthInitialization } from './initialized.js';

/** Copy of the setup token for operators who cannot read the log (ADR-0026). */
export const SETUP_TOKEN_FILE = 'setup-token';

interface Logger {
  warn(obj: object, msg: string): void;
}

/** First account only. The singleton database constraint is authoritative across processes. */
export class SetupService {
  private readonly token = randomBytes(32).toString('hex');
  private creating = false;
  constructor(
    private readonly db: Database.Database,
    private readonly contentDir: string,
    private readonly initialization: AuthInitialization,
    private readonly systemDir: string,
    private readonly logger: Logger,
  ) {}

  /**
   * ADR-0026: the token reaches only the operator, through the server log and a private file in
   * the system folder, never through the API. Called before the API opens; `issue` is false when
   * authentication is not local. A file left from an earlier start is always replaced or removed.
   */
  async prepare(issue: boolean): Promise<void> {
    const file = path.join(this.systemDir, SETUP_TOKEN_FILE);
    // Removes a symbolic link itself, never its target; the new file is created exclusively.
    await rm(file, { force: true });
    if (!issue || !this.required()) return;
    const handle = await open(
      file,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      0o600,
    );
    try {
      await handle.writeFile(`${this.token}\n`);
      await handle.sync();
    } finally {
      await handle.close();
    }
    // Warn level, so the default and quieter log levels still show it.
    this.logger.warn(
      { setupTokenFile: `system/${SETUP_TOKEN_FILE}` },
      `No administrator account yet. Open LeanDocs and enter this setup token: ${this.token}`,
    );
  }

  status(): SetupStatus {
    return { required: this.required() };
  }

  async create(input: SetupRequest, token: string | undefined): Promise<SetupResult> {
    if (!this.required())
      throw new AppError(409, 'SETUP_COMPLETE', 'An administrator account already exists.');
    if (
      !token ||
      token.length !== 64 ||
      !/^[0-9a-f]{64}$/.test(token) ||
      !timingSafeEqual(Buffer.from(token), Buffer.from(this.token))
    )
      throw new AppError(
        403,
        'INVALID_SETUP_TOKEN',
        'The setup token is not valid. Copy the newest one from the server log.',
      );
    const error = validateSetup(input);
    if (error) throw new AppError(400, 'VALIDATION_ERROR', error);
    if (this.creating)
      throw new AppError(
        409,
        'SETUP_BUSY',
        'Account creation is already in progress. Try again shortly.',
      );
    this.creating = true;
    try {
      const hash = await hashPassword(input.password);
      // Record initialization before the account INSERT; interrupted setup stays closed.
      this.initialization.record();
      const result = this.db
        .prepare(
          'INSERT OR IGNORE INTO users (id, username, password_hash, created_at) VALUES (1, ?, ?, ?)',
        )
        .run(input.username.trim(), hash, new Date().toISOString());
      if (result.changes !== 1)
        throw new AppError(409, 'SETUP_COMPLETE', 'An administrator account already exists.');
    } finally {
      this.creating = false;
    }
    // The token is useless once the account exists; a file that cannot be removed now is
    // removed at the next start.
    await rm(path.join(this.systemDir, SETUP_TOKEN_FILE), { force: true }).catch((error: unknown) =>
      this.logger.warn({ err: error }, 'Could not remove the used setup token file'),
    );
    return { required: false, contentDir: this.contentDir };
  }

  private required(): boolean {
    this.initialization.assertState();
    return !this.db.prepare('SELECT id FROM users LIMIT 1').get();
  }
}
