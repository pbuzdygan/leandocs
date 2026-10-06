import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import path from 'node:path';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import type Database from 'better-sqlite3';
import { TOTP, Secret } from 'otpauth';
import QRCode from 'qrcode';
import { APP_NAME, type MfaStatus } from '@leandocs/shared';
import { ConfigError } from '../config/config.js';
import { AppError } from '../errors.js';

export const tokenDigest = (value: string) => createHash('sha256').update(value).digest('hex');
const context = Buffer.from('app-mfa:v1:1');
export const invalidFactor = () =>
  new AppError(401, 'INVALID_MFA_CODE', 'Incorrect or already used verification code.');

/** Key is auth app data, separate from app.db; never regenerate it beneath enabled MFA. */
export async function loadMfaKey(systemDir: string, db: Database.Database): Promise<Buffer> {
  const filename = path.join(systemDir, 'mfa.key');
  try {
    const handle = await open(
      filename,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size !== 32 || (stat.mode & 0o077) !== 0)
        throw new ConfigError('MFA key must be a private 32-byte regular file (mode 0600).');
      const key = await handle.readFile();
      if (key.length !== 32) throw new ConfigError('MFA key must contain exactly 32 bytes.');
      return key;
    } finally {
      await handle.close();
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    if (db.prepare('SELECT user_id FROM user_mfa').get())
      throw new ConfigError('MFA key is missing. Restore system/mfa.key from the matching backup.');
    try {
      const handle = await open(
        filename,
        constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
        0o600,
      );
      try {
        await handle.writeFile(randomBytes(32));
        await handle.sync();
      } finally {
        await handle.close();
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
    return loadMfaKey(systemDir, db);
  }
}

export function totp(secret: string, username = ''): TOTP {
  return new TOTP({
    issuer: APP_NAME,
    label: username,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret,
  });
}

export function totpStep(secret: string, code: string, now: number): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const delta = totp(secret).validate({ token: code, timestamp: now * 1000, window: 1 });
  return delta === null ? null : Math.floor(now / 30) + delta;
}

export class MfaStore {
  constructor(
    private readonly db: Database.Database,
    private readonly key: Buffer,
  ) {
    const row = this.row();
    if (row) this.decrypt(row.secret); // Fail startup closed on corrupt/wrong-key active MFA.
  }
  private row() {
    return this.db.prepare('SELECT secret, last_step FROM user_mfa WHERE user_id = 1').get() as
      { secret: string; last_step: number } | undefined;
  }
  fingerprint(): string {
    return this.row()?.secret ?? '';
  }
  status(): MfaStatus {
    return {
      enabled: !!this.row(),
      recoveryCodesRemaining: (
        this.db.prepare('SELECT count(*) AS count FROM mfa_recovery_codes').get() as {
          count: number;
        }
      ).count,
    };
  }
  private encrypt(secret: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(context);
    const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
    return [
      'v1',
      iv.toString('hex'),
      cipher.getAuthTag().toString('hex'),
      encrypted.toString('hex'),
    ].join(':');
  }
  private decrypt(value: string): string {
    try {
      if (!/^v1:[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]{64}$/.test(value)) throw new Error();
      const [, iv, tag, encrypted] = value.split(':');
      const cipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv!, 'hex'));
      cipher.setAAD(context);
      cipher.setAuthTag(Buffer.from(tag!, 'hex'));
      const secret = Buffer.concat([
        cipher.update(Buffer.from(encrypted!, 'hex')),
        cipher.final(),
      ]).toString('utf8');
      if (!/^[A-Z2-7]{32}$/.test(secret)) throw new Error();
      return secret;
    } catch {
      throw new ConfigError(
        'Unable to decrypt MFA configuration. Restore the matching database and system/mfa.key.',
      );
    }
  }
  async enrollment(username: string) {
    const secret = new Secret({ size: 20 }).base32;
    const qrCode = await QRCode.toDataURL(totp(secret, username).toString(), {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 256,
    });
    return { secret, qrCode, expiresIn: 300 };
  }
  enable(secret: string, code: string, now: number): string[] {
    const step = totpStep(secret, code, now);
    if (step === null || step < 0) throw invalidFactor();
    if (this.row())
      throw new AppError(
        409,
        'MFA_ALREADY_ENABLED',
        'Two-factor authentication is already enabled.',
      );
    const codes = Array.from({ length: 10 }, () =>
      randomBytes(16).toString('hex').match(/.{8}/g)!.join('-'),
    );
    this.db.prepare('INSERT INTO user_mfa VALUES (1, ?, ?)').run(this.encrypt(secret), step);
    const insert = this.db.prepare('INSERT INTO mfa_recovery_codes VALUES (?, 1)');
    for (const code of codes) insert.run(tokenDigest(code.replaceAll('-', '')));
    return codes;
  }
  /** Call inside the transaction that issues a session or changes MFA state. */
  consume(code: string, now: number): void {
    const row = this.row();
    if (!row) throw invalidFactor();
    const recovery = code.replaceAll('-', '').toLowerCase();
    if (/^[0-9a-f]{32}$/.test(recovery)) {
      const result = this.db
        .prepare('DELETE FROM mfa_recovery_codes WHERE token_hash = ? AND user_id = 1')
        .run(tokenDigest(recovery));
      if (result.changes === 1) return;
      throw invalidFactor();
    }
    const step = totpStep(this.decrypt(row.secret), code, now);
    if (step === null || step <= row.last_step) throw invalidFactor();
    const result = this.db
      .prepare('UPDATE user_mfa SET last_step = ? WHERE user_id = 1 AND last_step = ?')
      .run(step, row.last_step);
    if (result.changes !== 1) throw invalidFactor();
  }
  disable(): void {
    this.db.prepare('DELETE FROM user_mfa WHERE user_id = 1').run();
  }
}
