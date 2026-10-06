import {
  chmod,
  copyFile,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import Database from 'better-sqlite3';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/config.js';
import { makeTempDir } from '../test/temp-dir.js';
import { AUTH_INITIALIZED_FILE, AuthInitialization } from '../auth/initialized.js';
import { IndexStore } from '../documents/index-store.js';
import { totp } from '../auth/mfa.js';
const apps: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});
const password = 'an authentication recovery passphrase';
function config(dataDir: string, authMode = 'local') {
  return loadConfig({
    DATA_DIR: dataDir,
    LOG_LEVEL: 'silent',
    ASSIGN_MISSING_IDS: 'false',
    AUTH_MODE: authMode,
    PROXY_TRUSTED_IPS: '192.0.2.10',
    PROXY_AUTH_HEADER: 'x-auth-request-user',
    PROXY_AUTH_USER: 'owner',
  });
}
async function fixture(enroll = false) {
  const dir = await makeTempDir();
  await mkdir(path.join(dir, 'content'));
  const content = path.join(dir, 'content/Guide.md');
  await writeFile(content, '# Original documentation\n');
  const app = await buildApp(config(dir));
  apps.push(app);
  const setup = (await app.inject('/api/v1/auth/setup')).json();
  expect(
    (
      await app.inject({
        method: 'POST',
        url: '/api/v1/auth/setup',
        headers: { 'x-leandocs-setup-token': setup.setupToken },
        payload: { username: 'owner', password, confirmPassword: password },
      })
    ).statusCode,
  ).toBe(201);
  if (enroll) {
    const anon = (await app.inject('/api/v1/auth/session')).json().csrfToken;
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { 'x-leandocs-csrf': anon },
      payload: { username: 'owner', password },
    });
    const headers = {
      cookie: String(login.headers['set-cookie']).split(';')[0]!,
      'x-leandocs-csrf': login.json().csrfToken,
    };
    const enrollment = (
      await app.inject({
        method: 'POST',
        url: '/api/v1/auth/mfa/enroll',
        headers,
        payload: { password },
      })
    ).json();
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/auth/mfa/confirm',
          headers,
          payload: { code: totp(enrollment.secret).generate() },
        })
      ).statusCode,
    ).toBe(200);
  }
  await app.close();
  apps.splice(apps.indexOf(app), 1);
  return {
    dir,
    content,
    system: path.join(dir, 'system'),
    file: path.join(dir, 'system/app.db'),
    marker: path.join(dir, 'system', AUTH_INITIALIZED_FILE),
  };
}

describe('fail-closed authentication recovery', () => {
  it.each(['local', 'proxy', 'none'])(
    'preserves corrupted database and refuses %s startup before setup can reopen',
    async (mode) => {
      const f = await fixture(true);
      const marker = await readFile(f.marker);
      const key = await readFile(path.join(f.system, 'mfa.key'));
      const damaged = Buffer.from('not a database'.repeat(200));
      await writeFile(f.file, damaged);
      await expect(buildApp(config(f.dir, mode))).rejects.toThrow('Startup stopped');
      expect(await readFile(f.file)).toEqual(damaged);
      expect(await readFile(f.marker)).toEqual(marker);
      expect(await readFile(path.join(f.system, 'mfa.key'))).toEqual(key);
      expect((await readdir(f.system)).some((name) => name.includes('corrupt-'))).toBe(false);
      expect(await readFile(f.content, 'utf8')).toBe('# Original documentation\n');
    },
  );
  it.each(['missing', 'empty', 'reset', 'missing-account'])(
    'rejects a %s database beneath an initialized account',
    async (failure) => {
      const f = await fixture();
      if (failure === 'missing') await rm(f.file);
      if (failure === 'empty') await writeFile(f.file, '');
      if (failure === 'reset') {
        await rm(f.file);
        const empty = new Database(f.file);
        empty.exec('CREATE TABLE placeholder (id)');
        empty.close();
      }
      if (failure === 'missing-account') {
        const db = new Database(f.file);
        db.exec('DELETE FROM users');
        db.close();
      }
      await expect(buildApp(config(f.dir))).rejects.toThrow(/Restore|Startup stopped/);
      if (failure === 'missing')
        await expect(stat(f.file)).rejects.toMatchObject({ code: 'ENOENT' });
      expect(await readFile(f.content, 'utf8')).toBe('# Original documentation\n');
    },
  );
  it('restores matching MFA/auth state and rebuilds only derived data', async () => {
    const f = await fixture(true);
    const backup = path.join(f.dir, 'backup.db');
    await copyFile(f.file, backup);
    await rm(f.file);
    await expect(buildApp(config(f.dir))).rejects.toThrow('Startup stopped');
    await copyFile(backup, f.file);
    const db = new Database(f.file);
    try {
      db.pragma('foreign_keys = ON');
      new IndexStore(db).clear();
    } finally {
      db.close();
    }
    const restored = await buildApp(config(f.dir));
    apps.push(restored);
    expect((await restored.inject('/api/v1/auth/setup')).json().required).toBe(false);
    const csrf = (await restored.inject('/api/v1/auth/session')).json().csrfToken;
    const response = await restored.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { 'x-leandocs-csrf': csrf },
      payload: { username: 'owner', password },
    });
    expect(response.json().mfaRequired).toBe(true);
    expect(response.headers['set-cookie']).toBeUndefined();
    const state = new Database(f.file);
    try {
      expect(state.prepare('SELECT count(*) AS n FROM mfa_recovery_codes').get()).toEqual({
        n: 10,
      });
      expect(state.prepare('SELECT count(*) AS n FROM documents').get()).toEqual({ n: 1 });
    } finally {
      state.close();
    }
  });
  it('adopts a legacy account without changing credentials and keeps unfinished fresh setup available', async () => {
    const f = await fixture();
    await rm(f.marker);
    const before = await readFile(f.file);
    const existing = await buildApp(config(f.dir));
    apps.push(existing);
    expect((await existing.inject('/api/v1/auth/setup')).json().required).toBe(false);
    expect((await stat(f.marker)).mode & 0o777).toBe(0o600);
    expect(before.length).toBeGreaterThan(0);
    const dir = await makeTempDir();
    const fresh = await buildApp(config(dir));
    await fresh.close();
    const restarted = await buildApp(config(dir));
    apps.push(restarted);
    expect((await restarted.inject('/api/v1/auth/setup')).json().required).toBe(true);
  });
  it('fails closed for invalid/permissive/symlinked markers and an interrupted initialization', async () => {
    const f = await fixture();
    await writeFile(f.marker, 'broken');
    await expect(buildApp(config(f.dir))).rejects.toThrow('marker');
    await rm(f.marker);
    const db = new Database(f.file);
    try {
      new AuthInitialization(db, f.system);
    } finally {
      db.close();
    }
    await chmod(f.marker, 0o644);
    await expect(buildApp(config(f.dir))).rejects.toThrow('marker');
    await chmod(f.marker, 0o600);
    await rm(f.marker);
    await symlink(f.file, f.marker);
    await expect(buildApp(config(f.dir))).rejects.toThrow('marker');
    await rm(f.marker);
    const interrupted = new Database(f.file);
    try {
      const guard = new AuthInitialization(interrupted, f.system);
      interrupted.exec('DELETE FROM users');
      expect(() => guard.assertState()).toThrow('setup remains closed');
    } finally {
      interrupted.close();
    }
  });
  it('does not recreate a missing legacy database with an MFA key or SQLite sidecars', async () => {
    for (const artifact of ['mfa.key', 'app.db-wal', 'app.db-shm', 'app.db.corrupt-old']) {
      const dir = await makeTempDir();
      await mkdir(path.join(dir, 'system'));
      await writeFile(path.join(dir, 'system', artifact), 'legacy');
      await expect(buildApp(config(dir))).rejects.toThrow('Startup stopped');
      await expect(stat(path.join(dir, 'system/app.db'))).rejects.toMatchObject({ code: 'ENOENT' });
    }
  });
});
