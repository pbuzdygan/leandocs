import path from 'node:path';
import Database from 'better-sqlite3';
import type { FastifyInstance, RouteOptions } from 'fastify';
import type { SessionResponse, SetupStatus } from '@leandocs/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/config.js';
import { makeTempDir } from '../test/temp-dir.js';

const apps: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});
const password = 'an administrator passphrase';
async function start(secure = false, dataDir = '') {
  dataDir ||= await makeTempDir();
  const routes: RouteOptions[] = [];
  const app = await buildApp(
    loadConfig({ DATA_DIR: dataDir, LOG_LEVEL: 'silent', SESSION_COOKIE_SECURE: String(secure) }),
    (route) => routes.push(route),
  );
  apps.push(app);
  const setup = (await app.inject('/api/v1/auth/setup')).json<SetupStatus>();
  if (setup.required)
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/auth/setup',
          headers: { 'x-leandocs-setup-token': setup.setupToken },
          payload: { username: 'Admin', password, confirmPassword: password },
        })
      ).statusCode,
    ).toBe(201);
  const anonymous = (await app.inject('/api/v1/auth/session')).json<SessionResponse>();
  const login = (username = 'admin', pass = password, headers: Record<string, string> = {}) =>
    app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { 'x-leandocs-csrf': anonymous.csrfToken, ...headers },
      payload: { username, password: pass },
    });
  return { app, routes, dataDir, anonymous, login };
}
const cookieOf = (headers: { 'set-cookie'?: string | string[] }) =>
  String(headers['set-cookie']).split(';')[0]!;

describe('local authentication', () => {
  it('issues HttpOnly cookies, stores only digests, rotates sessions and revokes logout', async () => {
    const { app, dataDir, login } = await start();
    const signed = await login();
    expect(signed.statusCode).toBe(200);
    const cookie = cookieOf(signed.headers);
    expect(signed.headers['set-cookie']).toContain('HttpOnly; SameSite=Strict; Max-Age=28800');
    expect(signed.headers['set-cookie']).not.toContain('Secure');
    expect(signed.headers['cache-control']).toBe('no-store');
    expect(signed.json().user).toEqual({ username: 'Admin' });
    expect((await app.inject({ url: '/api/v1/tree', headers: { cookie } })).statusCode).toBe(200);
    const db = new Database(path.join(dataDir, 'system', 'app.db'));
    try {
      const row = db.prepare('SELECT token_hash FROM sessions').get() as { token_hash: string };
      expect(row.token_hash).not.toBe(cookie.split('=')[1]);
    } finally {
      db.close();
    }
    const rotated = await login('admin', password, {
      cookie,
      'x-leandocs-csrf': signed.json().csrfToken,
    });
    const nextCookie = cookieOf(rotated.headers);
    expect(nextCookie).not.toBe(cookie);
    expect((await app.inject({ url: '/api/v1/tree', headers: { cookie } })).statusCode).toBe(401);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/auth/logout',
          headers: { cookie: nextCookie, 'x-leandocs-csrf': rotated.json().csrfToken },
        })
      ).statusCode,
    ).toBe(204);
    expect(
      (await app.inject({ url: '/api/v1/tree', headers: { cookie: nextCookie } })).statusCode,
    ).toBe(401);
  });

  it('keeps sessions across restarts and expires them on the server', async () => {
    const first = await start();
    const cookie = cookieOf((await first.login()).headers);
    await first.app.close();
    apps.splice(apps.indexOf(first.app), 1);
    const second = await start(false, first.dataDir);
    expect(
      (await second.app.inject({ url: '/api/v1/auth/session', headers: { cookie } })).json().user,
    ).toEqual({ username: 'Admin' });
    const db = new Database(path.join(first.dataDir, 'system', 'app.db'));
    try {
      db.prepare('UPDATE sessions SET created_at = 0, expires_at = 1').run();
    } finally {
      db.close();
    }
    expect((await second.app.inject({ url: '/api/v1/tree', headers: { cookie } })).statusCode).toBe(
      401,
    );
    expect(
      (await second.app.inject({ url: '/api/v1/auth/session', headers: { cookie } })).json().user,
    ).toBeNull();
  });

  it('protects every registered API route, including attachments, HEAD and invalid parameters', async () => {
    const { app, routes } = await start();
    const allowed = new Set([
      'GET /api/v1/health',
      'HEAD /api/v1/health',
      'GET /api/v1/auth/setup',
      'HEAD /api/v1/auth/setup',
      'POST /api/v1/auth/setup',
      'GET /api/v1/auth/session',
      'HEAD /api/v1/auth/session',
      'POST /api/v1/auth/login',
      'POST /api/v1/auth/mfa/verify',
    ]);
    let protectedCount = 0;
    for (const route of routes) {
      if (!route.url.startsWith('/api/v1/')) continue;
      for (const method of Array.isArray(route.method) ? route.method : [route.method]) {
        if (allowed.has(`${method} ${route.url}`)) continue;
        const url = route.url.replace(/:[^/]+/g, 'example');
        const result = await app.inject({
          method: method as 'GET' | 'HEAD' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'OPTIONS',
          url,
        });
        expect(result.statusCode, `${method} ${route.url}`).toBe(401);
        protectedCount++;
      }
    }
    expect(protectedCount).toBeGreaterThan(35);
    expect([401, 404]).toContain((await app.inject('/api/v1/%74ree')).statusCode);
    expect((await app.inject('/api/v1/documents/example/attachments/file.svg')).statusCode).toBe(
      401,
    );
    expect(
      (
        await app.inject({
          url: '/api/v1/tree',
          headers: { cookie: 'leandocs_session=bad; leandocs_session=bad' },
        })
      ).statusCode,
    ).toBe(401);
  });

  it('rejects forged auth headers/CSRF, uses generic credential errors and bounds login attempts', async () => {
    const { app, login, anonymous } = await start(true);
    expect(
      (
        await app.inject({
          url: '/api/v1/tree',
          headers: { 'x-forwarded-user': 'Admin', 'x-forwarded-proto': 'https' },
        })
      ).statusCode,
    ).toBe(401);
    const noToken = await login('admin', password, { 'x-leandocs-csrf': '' });
    expect(noToken.statusCode).toBe(403);
    expect((await login('admin', password, { 'sec-fetch-site': 'cross-site' })).statusCode).toBe(
      403,
    );
    const wrongUser = await login('absent', password);
    const wrongPass = await login('admin', 'incorrect');
    expect(wrongUser.statusCode).toBe(401);
    expect(wrongPass.json()).toEqual(wrongUser.json());
    const secure = await login();
    expect(secure.headers['set-cookie']).toContain('; Secure');
    expect(secure.json().csrfToken).not.toBe(anonymous.csrfToken);
    await login('admin', 'incorrect');
    await login('admin', 'incorrect');
    const limited = await login();
    expect(limited.statusCode).toBe(429);
    const wait = Number(limited.headers['retry-after']);
    expect(wait).toBeGreaterThanOrEqual(1);
    expect(wait).toBeLessThanOrEqual(60);
    expect(limited.json().error.details.retryAfterSeconds).toBe(wait);
  });

  it('upgrades an existing scrypt account only after successful authentication', async () => {
    const { dataDir, login } = await start();
    const legacy =
      '$scrypt$v=1$N=131072,r=8,p=1$000102030405060708090a0b0c0d0e0f$16a213093c4721c3ed047584af4781453cfd2e67c570020b6af758d84278393e';
    const db = new Database(path.join(dataDir, 'system', 'app.db'));
    try {
      db.prepare('UPDATE users SET password_hash = ?').run(legacy);
      expect((await login('admin', 'wrong')).statusCode).toBe(401);
      expect(db.prepare('SELECT password_hash FROM users').get()).toEqual({
        password_hash: legacy,
      });
      expect((await login('ADMIN', 'known password')).statusCode).toBe(200);
      expect(
        (db.prepare('SELECT password_hash FROM users').get() as { password_hash: string })
          .password_hash,
      ).toMatch(/^\$argon2id\$/);
    } finally {
      db.close();
    }
  });
  it('bounds concurrent password work before issuing sessions', async () => {
    const { login } = await start();
    const responses = await Promise.all([login(), login()]);
    expect(responses.map((response) => response.statusCode).sort()).toEqual([200, 429]);
    const busy = responses.find((response) => response.statusCode === 429)!;
    expect(busy.headers['retry-after']).toBe('1');
    expect(busy.json().error.code).toBe('LOGIN_BUSY');
    expect(busy.headers['set-cookie']).toBeUndefined();
  });
});
