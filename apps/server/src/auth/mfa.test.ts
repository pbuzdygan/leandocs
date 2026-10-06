import { chmod, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { migrate } from '../db/migrations.js';
import { makeTempDir } from '../test/temp-dir.js';
import { loadMfaKey, MfaStore, totp, totpStep } from './mfa.js';
const databases: Database.Database[] = [];
afterEach(() => {
  for (const db of databases.splice(0)) db.close();
});
async function fixture() {
  const dir = await makeTempDir();
  const db = new Database(path.join(dir, 'app.db'));
  databases.push(db);
  migrate(db);
  db.prepare('INSERT INTO users VALUES (1, ?, ?, ?)').run('owner', 'hash', 'now');
  const key = await loadMfaKey(dir, db);
  const store = new MfaStore(db, key);
  return { dir, db, key, store };
}
const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

describe('TOTP MFA storage', () => {
  it('matches RFC 6238 SHA1 test vectors reduced to six digits and rejects malformed/out-of-window codes', () => {
    for (const [time, code] of [
      [59, '287082'],
      [1111111109, '081804'],
      [1234567890, '005924'],
    ] as const)
      expect(totpStep(secret, code, time)).toBe(Math.floor(time / 30));
    expect(totpStep(secret, '287082', 59 + 90)).toBeNull();
    for (const code of ['12345', '1234567', '１２３４５６', '123456 ', 'abcdef'])
      expect(totpStep(secret, code, 59)).toBeNull();
  });
  it('creates a private persistent key, local QR URI and encrypted configuration', async () => {
    const { dir, db, key, store } = await fixture();
    expect((await stat(path.join(dir, 'mfa.key'))).mode & 0o777).toBe(0o600);
    expect(await loadMfaKey(dir, db)).toEqual(key);
    const enrollment = await store.enrollment('owner');
    expect(enrollment.qrCode).toMatch(/^data:image\/png;base64,/);
    expect(enrollment.secret).toMatch(/^[A-Z2-7]{32}$/);
    const uri = totp(enrollment.secret, 'owner').toString();
    expect(uri).toContain('otpauth://totp/LeanDocs:owner');
    const now = 1700000000;
    db.transaction(() =>
      store.enable(
        enrollment.secret,
        totp(enrollment.secret).generate({ timestamp: now * 1000 }),
        now,
      ),
    )();
    const row = db.prepare('SELECT secret FROM user_mfa').get() as { secret: string };
    expect(row.secret).not.toContain(enrollment.secret);
    expect(new MfaStore(db, key).status()).toEqual({ enabled: true, recoveryCodesRemaining: 10 });
  });
  it('rejects accepted TOTP steps after reopening and consumes recovery codes exactly once', async () => {
    const { db, key, store } = await fixture();
    const now = 1700000000;
    const code = totp(secret).generate({ timestamp: now * 1000 });
    const codes = db.transaction(() => store.enable(secret, code, now))();
    expect(() => db.transaction(() => store.consume(code, now))()).toThrow('already used');
    const reopened = new MfaStore(db, key);
    const next = totp(secret).generate({ timestamp: (now + 30) * 1000 });
    db.transaction(() => reopened.consume(next, now + 30))();
    expect(() => db.transaction(() => store.consume(next, now + 30))()).toThrow('already used');
    db.transaction(() => reopened.consume(codes[0]!, now + 30))();
    expect(store.status().recoveryCodesRemaining).toBe(9);
    expect(() => db.transaction(() => store.consume(codes[0]!, now + 30))()).toThrow(
      'already used',
    );
    const rows = db.prepare('SELECT token_hash FROM mfa_recovery_codes').all() as {
      token_hash: string;
    }[];
    for (const row of rows) {
      expect(row.token_hash).toMatch(/^[a-f0-9]{64}$/);
      expect(codes).not.toContain(row.token_hash);
    }
  });
  it('rolls factor consumption back when the protected operation fails', async () => {
    const { db, store } = await fixture();
    const now = 1700000000;
    const codes = db.transaction(() =>
      store.enable(secret, totp(secret).generate({ timestamp: now * 1000 }), now),
    )();
    expect(() =>
      db.transaction(() => {
        store.consume(codes[0]!, now);
        throw new Error('failed session');
      })(),
    ).toThrow('failed session');
    db.transaction(() => store.consume(codes[0]!, now))();
    expect(store.status().recoveryCodesRemaining).toBe(9);
  });
  it('fails closed for missing, permissive, corrupt, symlinked and wrong keys', async () => {
    const { dir, db, key, store } = await fixture();
    const now = 1700000000;
    db.transaction(() =>
      store.enable(secret, totp(secret).generate({ timestamp: now * 1000 }), now),
    )();
    expect(() => new MfaStore(db, Buffer.alloc(32))).toThrow('decrypt');
    await chmod(path.join(dir, 'mfa.key'), 0o644);
    await expect(loadMfaKey(dir, db)).rejects.toThrow('private');
    await chmod(path.join(dir, 'mfa.key'), 0o600);
    await rm(path.join(dir, 'mfa.key'));
    await expect(loadMfaKey(dir, db)).rejects.toThrow('missing');
    await writeFile(path.join(dir, 'other-key'), key, { mode: 0o600 });
    await symlink(path.join(dir, 'other-key'), path.join(dir, 'mfa.key'));
    await expect(loadMfaKey(dir, db)).rejects.toThrow();
    db.prepare("UPDATE user_mfa SET secret = 'corrupt'").run();
    expect(() => new MfaStore(db, key)).toThrow('decrypt');
    expect(await readFile(path.join(dir, 'other-key'))).toEqual(key);
  });
});
