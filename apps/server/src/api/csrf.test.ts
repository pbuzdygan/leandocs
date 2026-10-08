import path from 'node:path';
import { readFile, readdir } from 'node:fs/promises';
import type { FastifyInstance, RouteOptions } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/config.js';
import { makeTempDir } from '../test/temp-dir.js';

const apps: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});
async function start(mode: 'local' | 'proxy' | 'none', extra: NodeJS.ProcessEnv = {}) {
  const dataDir = await makeTempDir();
  const routes: RouteOptions[] = [];
  const app = await buildApp(
    loadConfig({
      DATA_DIR: dataDir,
      LOG_LEVEL: 'silent',
      AUTH_MODE: mode,
      PROXY_TRUSTED_IPS: '192.0.2.10',
      PROXY_AUTH_HEADER: 'x-auth-request-user',
      PROXY_AUTH_USER: 'owner',
      ...extra,
    }),
    (route) => routes.push(route),
  );
  apps.push(app);
  const headers: Record<string, string> = extra.PUBLIC_ORIGIN
    ? { host: new URL(extra.PUBLIC_ORIGIN).host }
    : {};
  // Real setup/login for local mode; proxy/none use their actual session protocol.
  if (mode === 'local') {
    const setup = (await app.inject({ url: '/api/v1/auth/setup', headers })).json();
    const password = 'a csrf administrator passphrase';
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/auth/setup',
          headers: { ...headers, 'x-leandocs-setup-token': setup.setupToken },
          payload: { username: 'owner', password, confirmPassword: password },
        })
      ).statusCode,
    ).toBe(201);
    const session = (await app.inject({ url: '/api/v1/auth/session', headers })).json();
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { ...headers, 'x-leandocs-csrf': session.csrfToken },
      payload: { username: 'owner', password },
    });
    expect(login.statusCode).toBe(200);
    headers.cookie = String(login.headers['set-cookie']).split(';')[0]!;
  }
  if (mode === 'proxy') headers['x-auth-request-user'] = 'owner';
  const remoteAddress = '192.0.2.10';
  const session = (
    await app.inject({ url: '/api/v1/auth/session', headers, remoteAddress })
  ).json();
  const csrfToken: string = session.csrfToken;
  const mutate = (
    more: Record<string, string | string[]> = {},
    payload: string | Record<string, unknown> = { name: 'Allowed', content: 'Safe.' },
  ) =>
    app.inject({
      method: 'POST',
      url: '/api/v1/documents',
      remoteAddress,
      headers: { ...headers, 'x-leandocs-csrf': csrfToken, ...more },
      payload,
    });
  return { app, dataDir, routes, headers, remoteAddress, csrfToken, mutate };
}

describe('global CSRF protection', () => {
  it.each(['local', 'proxy', 'none'] as const)(
    'rejects missing tokens before body parsing on every mutation in %s mode',
    async (mode) => {
      const { app, routes, headers, remoteAddress, mutate } = await start(mode);
      let checked = 0;
      for (const route of routes) {
        if (!route.url.startsWith('/api/v1/') || route.url.startsWith('/api/v1/auth/')) continue;
        for (const method of Array.isArray(route.method) ? route.method : [route.method]) {
          if (['GET', 'HEAD', 'OPTIONS'].includes(method)) continue;
          const response = await app.inject({
            method: method as 'POST' | 'PUT' | 'DELETE' | 'PATCH',
            remoteAddress,
            url: route.url.replace(/:[^/]+/g, 'example'),
            headers: { ...headers, 'content-type': 'application/json' },
            payload: '{malformed',
          });
          expect(response.statusCode, `${method} ${route.url}`).toBe(403);
          expect(response.json().error.code).toBe('INVALID_CSRF_TOKEN');
          checked++;
        }
      }
      expect(checked).toBeGreaterThan(15);
      for (const token of ['', 'a'.repeat(64), 'f'.repeat(65), ['a'.repeat(64), 'a'.repeat(64)]]) {
        const response = await mutate({ 'x-leandocs-csrf': token });
        expect(response.statusCode).toBe(403);
      }
      expect(
        (await mutate({ origin: 'http://localhost', 'sec-fetch-site': 'same-origin' })).statusCode,
      ).toBe(201);
    },
  );

  it.each(['local', 'proxy', 'none'] as const)(
    'rejects foreign/opaque/sibling origins even with a valid token in %s mode',
    async (mode) => {
      const { app, dataDir, mutate, headers, remoteAddress, csrfToken } = await start(mode);
      for (const origin of [
        'https://evil.test',
        'null',
        'http://localhost.evil.test',
        'http://localhost:9999',
        'http://localhost/path',
        'http://localhost, http://localhost',
      ])
        expect((await mutate({ origin })).statusCode).toBe(403);
      for (const site of ['cross-site', 'same-site', 'invalid'])
        expect((await mutate({ 'sec-fetch-site': site })).statusCode).toBe(403);
      expect((await mutate({ referer: 'http://evil.test/form' })).statusCode).toBe(403);
      expect((await mutate({ referer: 'not a URL' })).statusCode).toBe(403);
      expect(
        (await mutate({ origin: 'https://evil.test', referer: 'http://localhost/' })).statusCode,
      ).toBe(403);
      expect((await mutate({ referer: 'http://localhost/editor' })).statusCode).toBe(201);
      // URL/body tokens do not authorize a request, even for a multipart/simple form.
      expect(
        (
          await app.inject({
            method: 'POST',
            url: `/api/v1/documents?csrfToken=${csrfToken}`,
            remoteAddress,
            headers,
            payload: { name: 'Forged', csrfToken },
          })
        ).statusCode,
      ).toBe(403);
      expect(await readdir(path.join(dataDir, 'content'))).not.toContain('Forged.md');
      expect(
        (await app.inject({ method: 'HEAD', url: '/api/v1/tree', remoteAddress, headers }))
          .statusCode,
      ).toBe(200);
    },
  );

  it('uses the configured HTTPS origin behind NPM and rejects forged hosts/forwarded headers', async () => {
    const { app, headers, mutate } = await start('none', {
      PUBLIC_ORIGIN: 'https://docs.example.test',
    });
    expect(
      (await mutate({ origin: 'https://docs.example.test', 'sec-fetch-site': 'same-origin' }))
        .statusCode,
    ).toBe(201);
    expect(
      (await mutate({ origin: 'http://docs.example.test', 'x-forwarded-proto': 'https' }))
        .statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          url: '/api/v1/auth/session',
          headers: { host: 'evil.test', 'x-forwarded-host': headers.host! },
        })
      ).statusCode,
    ).toBe(403);
    expect((await app.inject('/api/v1/health')).statusCode).toBe(200);
    const fallback = await start('none', { SESSION_COOKIE_SECURE: 'true' });
    expect(
      (await fallback.mutate({ host: 'localhost', origin: 'https://localhost' })).statusCode,
    ).toBe(201);
    expect((await fallback.mutate({ origin: 'http://localhost' })).statusCode).toBe(403);
    const dev = await start('none');
    expect(
      (await dev.mutate({ host: 'localhost:5173', origin: 'http://localhost:5173' })).statusCode,
    ).toBe(201);
  });

  it('rejects multipart CSRF before saving any files and accepts a valid upload', async () => {
    const { app, dataDir, mutate, headers, remoteAddress, csrfToken } = await start('none');
    const id = (await mutate()).json().id;
    const body = Buffer.from(
      '--boundary\r\nContent-Disposition: form-data; name="file"; filename="proof.txt"\r\nContent-Type: text/plain\r\n\r\nhello\r\n--boundary--\r\n',
    );
    const url = `/api/v1/documents/${id}/attachments`;
    const upload = (more: Record<string, string> = {}) =>
      app.inject({
        method: 'POST',
        url,
        remoteAddress,
        headers: { ...headers, 'content-type': 'multipart/form-data; boundary=boundary', ...more },
        payload: body,
      });
    expect((await upload()).statusCode).toBe(403);
    expect(
      (await upload({ 'x-leandocs-csrf': csrfToken, origin: 'http://evil.test' })).statusCode,
    ).toBe(403);
    expect(await readdir(path.join(dataDir, 'content'))).not.toContain('Allowed.assets');
    expect(
      (await upload({ 'x-leandocs-csrf': csrfToken, origin: 'http://localhost' })).statusCode,
    ).toBe(201);
    expect(await readFile(path.join(dataDir, 'content/Allowed.assets/proof.txt'), 'utf8')).toBe(
      'hello',
    );
  });

  it('binds local tokens to the active session and rejects anonymous/other-session tokens', async () => {
    const first = await start('local');
    const anonymous = (await first.app.inject('/api/v1/auth/session')).json().csrfToken;
    expect((await first.mutate({ 'x-leandocs-csrf': anonymous })).statusCode).toBe(403);
    const second = await start('local');
    expect((await first.mutate({ 'x-leandocs-csrf': second.csrfToken })).statusCode).toBe(403);
    expect((await first.mutate()).statusCode).toBe(201);
  });
});
