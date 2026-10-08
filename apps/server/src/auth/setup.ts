import { randomBytes, timingSafeEqual } from 'node:crypto';
import type Database from 'better-sqlite3';
import { validateSetup, type SetupRequest, type SetupStatus } from '@leandocs/shared';
import { AppError } from '../errors.js';
import { hashPassword } from './password.js';
import type { AuthInitialization } from './initialized.js';

/** First account only. The singleton database constraint is authoritative across processes. */
export class SetupService {
  private readonly token = randomBytes(32).toString('hex');
  private creating = false;
  constructor(
    private readonly db: Database.Database,
    private readonly contentDir: string,
    private readonly initialization: AuthInitialization,
  ) {}
  status(): SetupStatus {
    this.initialization.assertState();
    const required = !this.db.prepare('SELECT id FROM users LIMIT 1').get();
    return required
      ? { required, contentDir: this.contentDir, setupToken: this.token }
      : { required, contentDir: this.contentDir };
  }
  async create(input: SetupRequest, token: string | undefined): Promise<SetupStatus> {
    if (!this.status().required)
      throw new AppError(409, 'SETUP_COMPLETE', 'An administrator account already exists.');
    if (
      !token ||
      token.length !== 64 ||
      !/^[0-9a-f]{64}$/.test(token) ||
      !timingSafeEqual(Buffer.from(token), Buffer.from(this.token))
    )
      throw new AppError(403, 'INVALID_SETUP_TOKEN', 'Reload setup and try again.');
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
      return { required: false, contentDir: this.contentDir };
    } finally {
      this.creating = false;
    }
  }
}
