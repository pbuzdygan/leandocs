import { type MfaStore, tokenDigest } from './mfa.js';
import type { MfaChallenge } from '@leandocs/shared';
import { LoginRateLimiter, LoginRateLimitError } from './rate-limit.js';
import { createHash, randomBytes } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { LoginRequest, SessionResponse } from '@leandocs/shared';
import { AppError } from '../errors.js';
import {
  hashPassword,
  MAX_PASSWORD_BYTES,
  needsPasswordRehash,
  verifyPassword,
} from './password.js';

export const SESSION_COOKIE = 'leandocs_session';
export const SESSION_SECONDS = 8 * 60 * 60;
const TOKEN = /^[0-9a-f]{64}$/;
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const dummyHash =
  '$argon2id$v=19$m=65536,t=3,p=1$AAECAwQFBgcICQoLDA0ODw$56sP5rHdTVbD+d0W7O7KIN60/v18vTRZUmfxE6NNDms';

export function sessionToken(cookie: string | undefined): string | undefined {
  const entries = (cookie ?? '')
    .split(';')
    .map((entry) => entry.trim())
    .filter((entry) => entry.startsWith(`${SESSION_COOKIE}=`));
  if (entries.length !== 1) return undefined;
  const token = entries[0]!.slice(SESSION_COOKIE.length + 1);
  return token.length === 64 && TOKEN.test(token) ? token : undefined;
}

export function sessionCookie(token: string, secure: boolean, clear = false): string {
  return `${SESSION_COOKIE}=${clear ? '' : token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${clear ? 0 : SESSION_SECONDS}${secure ? '; Secure' : ''}`;
}

interface UserRow {
  id: number;
  username: string;
  password_hash: string;
}

export class AuthService {
  private readonly anonymousCsrf = randomBytes(32).toString('hex');
  private authenticating = false;

  constructor(
    private readonly db: Database.Database,
    private readonly now = () => Math.floor(Date.now() / 1000),
    private readonly limiter = new LoginRateLimiter(),
    private readonly mfa?: MfaStore,
  ) {}

  session(cookie: string | undefined): SessionResponse {
    const token = sessionToken(cookie);
    if (token) {
      const row = this.db
        .prepare(
          `SELECT users.username, sessions.expires_at FROM sessions JOIN users ON users.id = sessions.user_id WHERE token_hash = ?`,
        )
        .get(digest(token)) as { username: string; expires_at: number } | undefined;
      if (row && row.expires_at > this.now())
        return {
          authMode: 'local',
          user: { username: row.username },
          csrfToken: digest(`csrf:${token}`),
        };
      if (row) this.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(digest(token));
    }
    return { authMode: 'local', user: null, csrfToken: this.anonymousCsrf };
  }

  private readonly challenges = new Map<
    string,
    {
      user: UserRow;
      csrf: string;
      previousCookie: string | undefined;
      expires: number;
      attempts: number;
      fingerprint: string;
    }
  >();
  private enrollment:
    { secret: string; cookie: string; expires: number; attempts: number } | undefined;

  private user(): UserRow | undefined {
    return this.db.prepare('SELECT id, username, password_hash FROM users WHERE id = 1').get() as
      UserRow | undefined;
  }
  private async password(input: LoginRequest, ip: string): Promise<UserRow> {
    this.limiter.consume(ip);
    if (this.authenticating) throw new LoginRateLimitError(1, true);
    this.authenticating = true;
    try {
      const user = this.user();
      const validInput =
        input.password.length > 0 &&
        Buffer.byteLength(input.password, 'utf8') <= MAX_PASSWORD_BYTES;
      const verified =
        validInput && (await verifyPassword(input.password, user?.password_hash ?? dummyHash));
      if (!verified || !user || user.username.toLowerCase() !== input.username.trim().toLowerCase())
        throw new AppError(401, 'INVALID_CREDENTIALS', 'Incorrect username or password.');
      if (needsPasswordRehash(user.password_hash)) {
        const updated = await hashPassword(input.password);
        const changed = this.db
          .prepare('UPDATE users SET password_hash = ? WHERE id = ? AND password_hash = ?')
          .run(updated, user.id, user.password_hash);
        if (changed.changes !== 1)
          throw new AppError(401, 'INVALID_CREDENTIALS', 'Incorrect username or password.');
        user.password_hash = updated;
      }
      return user;
    } finally {
      this.authenticating = false;
    }
  }
  private issue(user: UserRow, previousCookie: string | undefined) {
    if (this.user()?.password_hash !== user.password_hash)
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Incorrect username or password.');
    const token = randomBytes(32).toString('hex');
    const now = this.now();
    this.db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now);
    const previous = sessionToken(previousCookie);
    if (previous)
      this.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(digest(previous));
    this.db
      .prepare('INSERT INTO sessions VALUES (?, ?, ?, ?)')
      .run(digest(token), user.id, now, now + SESSION_SECONDS);
    return {
      token,
      session: {
        authMode: 'local',
        user: { username: user.username },
        csrfToken: digest(`csrf:${token}`),
      } satisfies SessionResponse,
    };
  }
  async login(
    input: LoginRequest,
    ip: string,
    previousCookie: string | undefined,
  ): Promise<{ token: string; session: SessionResponse } | { challenge: MfaChallenge }> {
    const user = await this.password(input, ip);
    if (this.mfa?.status().enabled) {
      for (const [key, value] of this.challenges)
        if (value.expires <= this.now()) this.challenges.delete(key);
      if (this.challenges.size >= 10) throw new LoginRateLimitError(60);
      const challenge = randomBytes(32).toString('hex');
      this.challenges.set(tokenDigest(challenge), {
        user,
        csrf: this.session(previousCookie).csrfToken,
        previousCookie,
        expires: this.now() + 300,
        attempts: 0,
        fingerprint: this.mfa.fingerprint(),
      });
      return { challenge: { mfaRequired: true, challenge, expiresIn: 300 } };
    }
    return this.db.transaction(() => this.issue(user, previousCookie))();
  }
  verifyMfa(challenge: string, code: string, ip: string, cookie: string | undefined) {
    this.limiter.consume(ip);
    const key = tokenDigest(challenge);
    const pending = TOKEN.test(challenge) ? this.challenges.get(key) : undefined;
    if (
      !pending ||
      pending.expires <= this.now() ||
      pending.attempts >= 5 ||
      pending.csrf !== this.session(cookie).csrfToken ||
      pending.fingerprint !== this.mfa?.fingerprint() ||
      this.user()?.password_hash !== pending.user.password_hash
    ) {
      if (pending) this.challenges.delete(key);
      throw new AppError(401, 'MFA_CHALLENGE_EXPIRED', 'Verification expired. Sign in again.');
    }
    pending.attempts++;
    try {
      const result = this.db.transaction(() => {
        this.mfa!.consume(code, this.now());
        return this.issue(pending.user, pending.previousCookie);
      })();
      this.challenges.delete(key);
      return result;
    } catch (error) {
      if (pending.attempts >= 5) this.challenges.delete(key);
      throw error;
    }
  }
  mfaStatus() {
    return this.mfa!.status();
  }
  private async reauthenticate(cookie: string | undefined, password: string, ip: string) {
    const current = this.session(cookie);
    if (!current.user) throw new AppError(401, 'UNAUTHORIZED', 'Sign in to access documentation.');
    const user = await this.password({ username: current.user.username, password }, ip);
    if (!this.session(cookie).user)
      throw new AppError(401, 'UNAUTHORIZED', 'Sign in to access documentation.');
    return user;
  }
  async enrollMfa(cookie: string | undefined, password: string, ip: string) {
    const user = await this.reauthenticate(cookie, password, ip);
    if (this.mfa!.status().enabled)
      throw new AppError(
        409,
        'MFA_ALREADY_ENABLED',
        'Two-factor authentication is already enabled.',
      );
    const result = await this.mfa!.enrollment(user.username);
    if (!this.session(cookie).user || this.mfa!.status().enabled)
      throw new AppError(409, 'MFA_STATE_CHANGED', 'Reload the page and try again.');
    this.enrollment = {
      secret: result.secret,
      cookie: digest(sessionToken(cookie)!),
      expires: this.now() + 300,
      attempts: 0,
    };
    return result;
  }
  cancelEnrollment(cookie: string | undefined) {
    if (this.enrollment?.cookie === digest(sessionToken(cookie) ?? '')) this.enrollment = undefined;
  }
  confirmMfa(cookie: string | undefined, code: string, ip: string) {
    this.limiter.consume(ip);
    const pending = this.enrollment;
    if (
      !pending ||
      pending.cookie !== digest(sessionToken(cookie) ?? '') ||
      pending.expires <= this.now() ||
      pending.attempts >= 5
    ) {
      if (pending && pending.expires <= this.now()) this.enrollment = undefined;
      throw new AppError(401, 'MFA_ENROLLMENT_EXPIRED', 'Enrollment expired. Start again.');
    }
    pending.attempts++;
    const user = this.user()!;
    try {
      const result = this.db.transaction(() => {
        const recoveryCodes = this.mfa!.enable(pending.secret, code, this.now());
        this.db.prepare('DELETE FROM sessions').run();
        return { ...this.issue(user, undefined), recoveryCodes };
      })();
      this.enrollment = undefined;
      this.challenges.clear();
      return result;
    } catch (error) {
      if (pending.attempts >= 5) this.enrollment = undefined;
      throw error;
    }
  }
  async disableMfa(cookie: string | undefined, password: string, code: string, ip: string) {
    const user = await this.reauthenticate(cookie, password, ip);
    const result = this.db.transaction(() => {
      this.mfa!.consume(code, this.now());
      this.mfa!.disable();
      this.db.prepare('DELETE FROM sessions').run();
      return this.issue(user, undefined);
    })();
    this.enrollment = undefined;
    this.challenges.clear();
    return result;
  }

  logout(cookie: string | undefined): void {
    const token = sessionToken(cookie);
    if (token) {
      if (this.enrollment?.cookie === digest(token)) this.enrollment = undefined;
      for (const [key, pending] of this.challenges)
        if (sessionToken(pending.previousCookie) === token) this.challenges.delete(key);
    }
    if (token) this.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(digest(token));
  }
}
