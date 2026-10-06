import path from 'node:path';
import Database from 'better-sqlite3';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/config.js';
import { makeTempDir } from '../test/temp-dir.js';
import { totp } from '../auth/mfa.js';
const apps: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  vi.restoreAllMocks();
});
const password = 'an MFA administrator passphrase';
async function start() {
  let seconds = 1700000000;
  vi.spyOn(Date, 'now').mockImplementation(() => seconds * 1000);
  vi.spyOn(performance, 'now').mockImplementation(() => seconds * 1000);
  const dataDir = await makeTempDir();
  const app = await buildApp(loadConfig({ DATA_DIR: dataDir, LOG_LEVEL: 'silent' }));
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
  const anon = (await app.inject('/api/v1/auth/session')).json().csrfToken;
  const login = () =>
    app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { 'x-leandocs-csrf': anon },
      payload: { username: 'owner', password },
    });
  const signed = await login();
  let cookie = String(signed.headers['set-cookie']).split(';')[0]!;
  let csrf = signed.json().csrfToken;
  const request = (
    route: string,
    payload: Record<string, unknown>,
    more: Record<string, string> = {},
  ) =>
    app.inject({
      method: 'POST',
      url: `/api/v1/auth/mfa/${route}`,
      headers: { cookie, 'x-leandocs-csrf': csrf, ...more },
      payload,
    });
  const adopt = (response: Awaited<ReturnType<FastifyInstance['inject']>>, wrapped = false) => {
    cookie = String(response.headers['set-cookie']).split(';')[0]!;
    csrf = (wrapped ? response.json().session : response.json()).csrfToken;
  };
  const code = (secret: string) => totp(secret).generate({ timestamp: seconds * 1000 });
  const advance = (value = 61) => {
    seconds += value;
  };
  const enroll = async () => {
    const pending = await request('enroll', { password });
    expect(pending.statusCode).toBe(200);
    const secret = pending.json().secret;
    const confirmed = await request('confirm', { code: code(secret) });
    expect(confirmed.statusCode).toBe(200);
    adopt(confirmed, true);
    return { secret, codes: confirmed.json().recoveryCodes as string[] };
  };
  const verify = (challenge: string, code: string) =>
    app.inject({
      method: 'POST',
      url: '/api/v1/auth/mfa/verify',
      headers: { 'x-leandocs-csrf': anon },
      payload: { challenge, code },
    });
  return {
    app,
    dataDir,
    login,
    request,
    adopt,
    code,
    advance,
    enroll,
    verify,
    get cookie() {
      return cookie;
    },
  };
}

describe('local MFA API', () => {
  it('requires confirmation, revokes old sessions, and never grants access after password alone', async () => {
    const f = await start();
    const old = f.cookie;
    expect((await f.request('enroll', { password: 'wrong' })).statusCode).toBe(401);
    const { secret, codes } = await f.enroll();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    expect((await f.app.inject({ url: '/api/v1/tree', headers: { cookie: old } })).statusCode).toBe(
      401,
    );
    expect(
      (await f.app.inject({ url: '/api/v1/tree', headers: { cookie: f.cookie } })).statusCode,
    ).toBe(200);
    f.advance();
    const partial = await f.login();
    expect(partial.statusCode).toBe(200);
    expect(partial.json()).toMatchObject({ mfaRequired: true, expiresIn: 300 });
    expect(partial.headers['set-cookie']).toBeUndefined();
    expect((await f.app.inject('/api/v1/tree')).statusCode).toBe(401);
    const signed = await f.verify(partial.json().challenge, f.code(secret));
    expect(signed.statusCode).toBe(200);
    expect(signed.headers['set-cookie']).toContain('HttpOnly');
    expect((await f.verify(partial.json().challenge, codes[0]!)).statusCode).toBe(401);
  });
  it('rejects repeated TOTP and recovery codes across challenges, including concurrent verification', async () => {
    const f = await start();
    const { secret, codes } = await f.enroll();
    f.advance();
    const first = (await f.login()).json().challenge;
    const second = (await f.login()).json().challenge;
    const results = await Promise.all([
      f.verify(first, f.code(secret)),
      f.verify(second, f.code(secret)),
    ]);
    expect(results.map((result) => result.statusCode).sort()).toEqual([200, 401]);
    f.advance();
    const recovery1 = (await f.login()).json().challenge;
    const recovery2 = (await f.login()).json().challenge;
    const recovered = await Promise.all([
      f.verify(recovery1, codes[0]!),
      f.verify(recovery2, codes[0]!),
    ]);
    expect(recovered.map((result) => result.statusCode).sort()).toEqual([200, 401]);
  });
  it('shares rate limits across new challenges and expires challenges after five attempts or five minutes', async () => {
    const f = await start();
    const { codes } = await f.enroll();
    f.advance();
    const challenge = (await f.login()).json().challenge;
    for (let n = 0; n < 5; n++) {
      f.advance(31);
      expect((await f.verify(challenge, 'bad')).statusCode).toBe(401);
    }
    f.advance();
    expect((await f.verify(challenge, codes[0]!)).json().error.code).toBe('MFA_CHALLENGE_EXPIRED');
    f.advance();
    const expiring = (await f.login()).json().challenge;
    f.advance(301);
    expect((await f.verify(expiring, codes[1]!)).statusCode).toBe(401);
    f.advance();
    const fresh = (await f.login()).json().challenge;
    for (let n = 0; n < 4; n++) expect((await f.verify(fresh, 'wrong')).statusCode).toBe(401);
    expect((await f.login()).statusCode).toBe(429);
  });
  it('bounds live challenges even when passwords are correct and the rate budget resets', async () => {
    const f = await start();
    await f.enroll();
    for (let batch = 0; batch < 2; batch++) {
      f.advance();
      for (let n = 0; n < 5; n++) expect((await f.login()).json().mfaRequired).toBe(true);
    }
    f.advance();
    const full = await f.login();
    expect(full.statusCode).toBe(429);
    expect(full.headers['set-cookie']).toBeUndefined();
    f.advance(301);
    expect((await f.login()).json().mfaRequired).toBe(true);
  });
  it('requires password and unused factor to disable, rotates sessions and invalidates pending challenges', async () => {
    const f = await start();
    const { codes } = await f.enroll();
    const old = f.cookie;
    f.advance();
    const pending = (await f.login()).json().challenge;
    expect((await f.request('disable', { password: 'wrong', code: codes[0]! })).statusCode).toBe(
      401,
    );
    expect((await f.request('disable', { password, code: 'wrong' })).statusCode).toBe(401);
    const disabled = await f.request('disable', { password, code: codes[0]! });
    expect(disabled.statusCode).toBe(200);
    f.adopt(disabled);
    expect((await f.app.inject({ url: '/api/v1/tree', headers: { cookie: old } })).statusCode).toBe(
      401,
    );
    expect((await f.verify(pending, codes[1]!)).statusCode).toBe(401);
    f.advance();
    expect((await f.login()).headers['set-cookie']).toBeDefined();
  });
  it('persists enabled MFA and recovery state across restart but discards challenges', async () => {
    const f = await start();
    const { codes } = await f.enroll();
    f.advance();
    const pending = (await f.login()).json().challenge;
    await f.app.close();
    apps.splice(apps.indexOf(f.app), 1);
    const app = await buildApp(loadConfig({ DATA_DIR: f.dataDir, LOG_LEVEL: 'silent' }));
    apps.push(app);
    const csrf = (await app.inject('/api/v1/auth/session')).json().csrfToken;
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/auth/mfa/verify',
          headers: { 'x-leandocs-csrf': csrf },
          payload: { challenge: pending, code: codes[0] },
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/auth/login',
          headers: { 'x-leandocs-csrf': csrf },
          payload: { username: 'owner', password },
        })
      ).json().mfaRequired,
    ).toBe(true);
    const db = new Database(path.join(f.dataDir, 'system/app.db'));
    try {
      expect(db.prepare('SELECT count(*) AS n FROM mfa_recovery_codes').get()).toEqual({ n: 10 });
    } finally {
      db.close();
    }
  });
  it('cancels, replaces and expires unconfirmed enrollment without enabling MFA', async () => {
    const f = await start();
    const first = await f.request('enroll', { password });
    const second = await f.request('enroll', { password });
    expect((await f.request('confirm', { code: f.code(first.json().secret) })).statusCode).toBe(
      401,
    );
    const csrf = (
      await f.app.inject({ url: '/api/v1/auth/session', headers: { cookie: f.cookie } })
    ).json().csrfToken;
    expect(
      (
        await f.app.inject({
          method: 'DELETE',
          url: '/api/v1/auth/mfa/enroll',
          headers: { cookie: f.cookie, 'x-leandocs-csrf': csrf },
        })
      ).statusCode,
    ).toBe(204);
    expect((await f.request('confirm', { code: f.code(second.json().secret) })).statusCode).toBe(
      401,
    );
    f.advance();
    const expired = await f.request('enroll', { password });
    f.advance(301);
    expect((await f.request('confirm', { code: f.code(expired.json().secret) })).statusCode).toBe(
      401,
    );
    expect(
      (
        await f.app.inject({ url: '/api/v1/auth/mfa/status', headers: { cookie: f.cookie } })
      ).json(),
    ).toEqual({ enabled: false, recoveryCodesRemaining: 0 });
  });
  it('protects MFA mutations with CSRF, session binding and local-mode gates', async () => {
    const f = await start();
    expect((await f.request('enroll', { password }, { 'x-leandocs-csrf': '' })).statusCode).toBe(
      403,
    );
    const pending = await f.request('enroll', { password });
    const other = await f.login();
    expect(
      (
        await f.request(
          'confirm',
          { code: f.code(pending.json().secret) },
          {
            cookie: String(other.headers['set-cookie']).split(';')[0]!,
            'x-leandocs-csrf': other.json().csrfToken,
          },
        )
      ).statusCode,
    ).toBe(401);
    for (const mode of ['proxy', 'none']) {
      const app = await buildApp(
        loadConfig({
          DATA_DIR: await makeTempDir(),
          LOG_LEVEL: 'silent',
          AUTH_MODE: mode,
          PROXY_TRUSTED_IPS: '192.0.2.10',
          PROXY_AUTH_HEADER: 'x-auth-request-user',
          PROXY_AUTH_USER: 'owner',
        }),
      );
      apps.push(app);
      for (const route of ['enroll', 'confirm', 'verify', 'disable'])
        expect(
          (
            await app.inject({
              method: 'POST',
              url: `/api/v1/auth/mfa/${route}`,
              payload: 'invalid json',
              headers: { 'content-type': 'application/json' },
            })
          ).statusCode,
        ).toBe(403);
      expect((await app.inject('/api/v1/auth/mfa/status')).statusCode).toBe(403);
    }
  });
});
