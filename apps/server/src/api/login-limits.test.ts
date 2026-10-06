import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/config.js';
import { makeTempDir } from '../test/temp-dir.js';

const apps: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  vi.restoreAllMocks();
});
const password = 'a rate limit administrator passphrase';
async function start() {
  let seconds = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => seconds * 1000);
  const app = await buildApp(loadConfig({ DATA_DIR: await makeTempDir(), LOG_LEVEL: 'silent' }));
  apps.push(app);
  const setup = (await app.inject('/api/v1/auth/setup')).json();
  expect(
    (
      await app.inject({
        method: 'POST',
        url: '/api/v1/auth/setup',
        headers: { 'x-leandocs-setup-token': setup.setupToken },
        payload: { username: 'Owner', password, confirmPassword: password },
      })
    ).statusCode,
  ).toBe(201);
  const csrfToken = (await app.inject('/api/v1/auth/session')).json().csrfToken;
  const login = (
    ip: string,
    username = 'Owner',
    pass = password,
    headers: Record<string, string> = {},
  ) =>
    app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      remoteAddress: ip,
      headers: { 'x-leandocs-csrf': csrfToken, ...headers },
      payload: { username, password: pass },
    });
  return {
    app,
    login,
    csrfToken,
    at: (value: number) => {
      seconds = value;
    },
  };
}

describe('login rate-limit API', () => {
  it('limits distributed attempts independently of username and preserves existing sessions', async () => {
    const { app, login, at } = await start();
    const signed = await login('192.0.2.1');
    expect(signed.statusCode).toBe(200);
    const cookie = String(signed.headers['set-cookie']).split(';')[0]!;
    let failure: unknown;
    for (let n = 2; n <= 10; n++) {
      const result = await login(`192.0.2.${n}`, n % 2 ? ' owner ' : `absent-${n}`, 'incorrect');
      expect(result.statusCode).toBe(401);
      failure ??= result.json();
      expect(result.json()).toEqual(failure);
    }
    for (const username of ['Owner', 'absent']) {
      const limited = await login('192.0.2.200', username);
      expect(limited.statusCode).toBe(429);
      expect(limited.json().error.code).toBe('LOGIN_RATE_LIMIT');
      expect(limited.headers['retry-after']).toBe('60');
      expect(limited.headers['set-cookie']).toBeUndefined();
      expect(limited.headers['cache-control']).toBe('no-store');
      expect(limited.headers['x-content-type-options']).toBe('nosniff');
    }
    expect((await app.inject({ url: '/api/v1/tree', headers: { cookie } })).statusCode).toBe(200);
    expect((await app.inject('/api/v1/health')).statusCode).toBe(200);
    at(45.2);
    const limited = await login('192.0.2.201');
    expect(limited.headers['retry-after']).toBe('15');
    expect(limited.json().error.details.retryAfterSeconds).toBe(15);
    at(60);
    expect((await login('192.0.2.201')).statusCode).toBe(200);
  });

  it('shares a direct NPM peer limit despite spoofed forwarded addresses, identity or new CSRF tokens', async () => {
    const { app, login, at } = await start();
    for (let n = 0; n < 5; n++) {
      const fresh = (await app.inject('/api/v1/auth/session')).json().csrfToken;
      const result = await login(
        n % 2 ? '::ffff:192.0.2.10' : '192.0.2.10',
        n % 2 ? 'Owner' : 'other',
        'wrong',
        {
          'x-forwarded-for': `203.0.113.${n}`,
          'x-real-ip': `203.0.113.${n}`,
          forwarded: `for=203.0.113.${n}`,
          'x-auth-request-user': 'other',
          'x-leandocs-csrf': fresh,
        },
      );
      expect(result.statusCode).toBe(401);
    }
    expect((await login('192.0.2.10')).statusCode).toBe(429);
    expect((await login('192.0.2.11', 'Owner', 'wrong')).statusCode).toBe(401);
    at(60);
    expect((await login('192.0.2.10')).statusCode).toBe(200);
  });

  it('rejects CSRF and schema failures before reserving password-verification attempts', async () => {
    const { app, login, csrfToken } = await start();
    for (let n = 0; n < 6; n++) {
      expect(
        (await login('192.0.2.10', 'Owner', password, { 'x-leandocs-csrf': '' })).statusCode,
      ).toBe(403);
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/api/v1/auth/login',
            remoteAddress: '192.0.2.10',
            headers: { 'x-leandocs-csrf': csrfToken },
            payload: {},
          })
        ).statusCode,
      ).toBe(400);
    }
    for (let n = 0; n < 5; n++)
      expect((await login('192.0.2.10', 'Owner', 'wrong')).statusCode).toBe(401);
    expect((await login('192.0.2.10')).statusCode).toBe(429);
  });
});
