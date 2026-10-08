import type { FastifyInstance } from 'fastify';
import type { SessionResponse, SetupStatus } from '@leandocs/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/config.js';
import { makeTempDir } from '../test/temp-dir.js';

/** P16-10 (OQ-5): changing the password of the signed-in account. */

const apps: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

const OLD = 'an administrator passphrase';
const NEW = 'a brand new administrator passphrase';
const cookieOf = (headers: { 'set-cookie'?: string | string[] }) =>
  String(headers['set-cookie']).split(';')[0]!;

async function start(dataDir = '') {
  dataDir ||= await makeTempDir();
  const app = await buildApp(loadConfig({ DATA_DIR: dataDir, LOG_LEVEL: 'silent' }));
  apps.push(app);
  const setup = (await app.inject('/api/v1/auth/setup')).json<SetupStatus>();
  if (setup.required)
    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/setup',
      headers: { 'x-leandocs-setup-token': setup.setupToken },
      payload: { username: 'admin', password: OLD, confirmPassword: OLD },
    });
  const login = async (password: string) => {
    const anonymous = (await app.inject('/api/v1/auth/session')).json<SessionResponse>();
    return app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { 'x-leandocs-csrf': anonymous.csrfToken },
      payload: { username: 'admin', password },
    });
  };
  const session = async (cookie: string) =>
    (
      await app.inject({ url: '/api/v1/auth/session', headers: { cookie } })
    ).json<SessionResponse>();
  const change = async (cookie: string, payload: Record<string, unknown>) =>
    app.inject({
      method: 'POST',
      url: '/api/v1/auth/password',
      headers: { cookie, 'x-leandocs-csrf': (await session(cookie)).csrfToken },
      payload,
    });
  return { app, dataDir, login, session, change };
}

describe('change password', () => {
  it('replaces the password, keeps this browser signed in and signs out every other session', async () => {
    const { app, dataDir, login, session, change } = await start();
    const here = cookieOf((await login(OLD)).headers);
    const elsewhere = cookieOf((await login(OLD)).headers);

    const changed = await change(here, {
      currentPassword: OLD,
      newPassword: NEW,
      confirmPassword: NEW,
    });
    expect(changed.statusCode, changed.body).toBe(200);
    expect(changed.json<SessionResponse>().user).toEqual({ username: 'admin' });
    const renewed = cookieOf(changed.headers);
    expect(renewed).not.toBe(here);
    expect((await session(renewed)).user).toEqual({ username: 'admin' });
    expect((await session(here)).user).toBeNull();
    expect((await session(elsewhere)).user).toBeNull();

    expect((await login(OLD)).statusCode).toBe(401);
    expect((await login(NEW)).statusCode).toBe(200);
    // Stored, not only in memory.
    await app.close();
    apps.length = 0;
    const restarted = await start(dataDir);
    expect((await restarted.login(NEW)).statusCode).toBe(200);
  });

  it('requires the current password and a valid, different new password', async () => {
    const { login, session, change } = await start();
    const cookie = cookieOf((await login(OLD)).headers);
    const cases: [Record<string, unknown>, number, string][] = [
      [
        { currentPassword: 'wrong passphrase!', newPassword: NEW, confirmPassword: NEW },
        401,
        'The current password is incorrect.',
      ],
      [
        { currentPassword: OLD, newPassword: 'too short', confirmPassword: 'too short' },
        400,
        'Password must contain at least 15 characters.',
      ],
      [
        { currentPassword: OLD, newPassword: NEW, confirmPassword: `${NEW}!` },
        400,
        'Passwords do not match.',
      ],
      [
        { currentPassword: OLD, newPassword: OLD, confirmPassword: OLD },
        400,
        'Choose a password different from the current one.',
      ],
    ];
    for (const [payload, status, message] of cases) {
      const response = await change(cookie, payload);
      expect(response.statusCode, JSON.stringify(payload)).toBe(status);
      expect(response.json().error.message).toBe(message);
    }
    // A wrong current password is not a lost session: this browser stays signed in.
    expect((await session(cookie)).user).toEqual({ username: 'admin' });
    expect((await change(cookie, { currentPassword: OLD })).statusCode).toBe(400);
    expect((await login(OLD)).statusCode).toBe(200);
  });

  it('needs a signed-in session and the CSRF token, and counts wrong passwords like sign-in', async () => {
    const { app, login, change } = await start();
    const anonymous = (await app.inject('/api/v1/auth/session')).json<SessionResponse>();
    const payload = { currentPassword: OLD, newPassword: NEW, confirmPassword: NEW };
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/auth/password',
          headers: { 'x-leandocs-csrf': anonymous.csrfToken },
          payload,
        })
      ).statusCode,
    ).toBe(401);
    const cookie = cookieOf((await login(OLD)).headers);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/auth/password',
          headers: { cookie },
          payload,
        })
      ).statusCode,
    ).toBe(403);

    const statuses: number[] = [];
    for (let attempt = 0; attempt < 8; attempt++)
      statuses.push(
        (await change(cookie, { ...payload, currentPassword: `wrong passphrase ${attempt}` }))
          .statusCode,
      );
    expect(statuses).toContain(429);
  });
});
