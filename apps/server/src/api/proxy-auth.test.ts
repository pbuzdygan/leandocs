import path from 'node:path';
import Database from 'better-sqlite3';
import type { FastifyInstance, RouteOptions } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/config.js';
import { makeTempDir } from '../test/temp-dir.js';

const apps: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});
const identity = { 'x-auth-request-user': 'admin@example.com' };
async function start(extra: NodeJS.ProcessEnv = {}) {
  const dataDir = extra.DATA_DIR ?? (await makeTempDir());
  const routes: RouteOptions[] = [];
  const app = await buildApp(
    loadConfig({
      DATA_DIR: dataDir,
      LOG_LEVEL: 'silent',
      AUTH_MODE: 'proxy',
      PROXY_TRUSTED_IPS: '192.0.2.10,2001:db8::10',
      PROXY_AUTH_HEADER: 'x-auth-request-user',
      PROXY_AUTH_USER: 'admin@example.com',
      ...extra,
    }),
    (route) => routes.push(route),
  );
  apps.push(app);
  return { app, dataDir, routes };
}

describe('trusted proxy authentication', () => {
  it('requires the immediate peer and exact single-user identity on every request', async () => {
    const { app, dataDir } = await start();
    for (const peer of ['192.0.2.10', '::ffff:192.0.2.10', '2001:0db8:0:0:0:0:0:10']) {
      const status = await app.inject({
        url: '/api/v1/auth/session',
        remoteAddress: peer,
        headers: identity,
      });
      expect(status.json()).toMatchObject({
        authMode: 'proxy',
        user: { username: 'admin@example.com' },
      });
      expect(status.json().csrfToken).toMatch(/^[a-f0-9]{64}$/);
      expect(status.headers['set-cookie']).toBeUndefined();
      expect(status.headers['cache-control']).toBe('no-store');
      expect(
        (await app.inject({ url: '/api/v1/tree', remoteAddress: peer, headers: identity }))
          .statusCode,
      ).toBe(200);
    }
    for (const peer of ['192.0.2.11', '127.0.0.1', '2001:db8::11']) {
      expect(
        (
          await app.inject({
            url: '/api/v1/tree',
            remoteAddress: peer,
            headers: {
              ...identity,
              'x-forwarded-for': '192.0.2.10',
              forwarded: 'for=192.0.2.10',
              'x-forwarded-proto': 'https',
            },
          })
        ).statusCode,
      ).toBe(401);
      expect(
        (
          await app.inject({ url: '/api/v1/auth/session', remoteAddress: peer, headers: identity })
        ).json(),
      ).toEqual({ authMode: 'proxy', user: null, csrfToken: '' });
    }
    for (const value of [
      '',
      'other@example.com',
      'Admin@example.com',
      'admin@example.com,admin@example.com',
    ])
      expect(
        (
          await app.inject({
            url: '/api/v1/tree',
            remoteAddress: '192.0.2.10',
            headers: { 'x-auth-request-user': value },
          })
        ).statusCode,
      ).toBe(401);
    expect(
      (await app.inject({ url: '/api/v1/tree', remoteAddress: '192.0.2.10' })).statusCode,
    ).toBe(401);
    const db = new Database(path.join(dataDir, 'system/app.db'));
    try {
      expect(db.prepare('SELECT count(*) AS n FROM users').get()).toEqual({ n: 0 });
      expect(db.prepare('SELECT count(*) AS n FROM sessions').get()).toEqual({ n: 0 });
    } finally {
      db.close();
    }
  });

  it('rejects duplicate identity headers and protects all content routes before validation', async () => {
    const { app, routes } = await start();
    expect(
      (
        await app.inject({
          url: '/api/v1/tree',
          remoteAddress: '192.0.2.10',
          headers: { 'x-auth-request-user': ['admin@example.com', 'admin@example.com'] },
        })
      ).statusCode,
    ).toBe(401);
    let checked = 0;
    for (const route of routes) {
      if (
        !route.url.startsWith('/api/v1/') ||
        route.url === '/api/v1/health' ||
        route.url.startsWith('/api/v1/auth/')
      )
        continue;
      for (const method of Array.isArray(route.method) ? route.method : [route.method]) {
        const result = await app.inject({
          method: method as 'GET' | 'HEAD' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'OPTIONS',
          url: route.url.replace(/:[^/]+/g, 'example'),
          headers: identity,
          remoteAddress: '192.0.2.11',
        });
        expect(result.statusCode, `${method} ${route.url}`).toBe(401);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(35);
    expect((await app.inject('/api/v1/health')).statusCode).toBe(200);
    expect([401, 404]).toContain(
      (await app.inject({ url: '/api/v1/%74ree', headers: identity, remoteAddress: '192.0.2.11' }))
        .statusCode,
    );
  });

  it('bypasses local setup and disables local credential/session endpoints before parsing', async () => {
    const { app } = await start();
    const status = await app.inject('/api/v1/auth/setup');
    expect(status.json()).toMatchObject({ required: false, authMode: 'proxy' });
    expect(status.json().setupToken).toBeUndefined();
    for (const endpoint of ['setup', 'login', 'logout']) {
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/auth/${endpoint}`,
        remoteAddress: '192.0.2.10',
        headers: { ...identity, 'content-type': 'application/json' },
        payload: '{invalid json',
      });
      expect(response.statusCode).toBe(403);
      expect(response.json().error.code).toBe('AUTH_MANAGED_BY_PROXY');
      expect(response.headers['set-cookie']).toBeUndefined();
    }
  });

  it('ignores existing local cookies and preserves local accounts when switching modes', async () => {
    const first = await start({ AUTH_MODE: 'local' });
    const setup = (await first.app.inject('/api/v1/auth/setup')).json();
    const password = 'a local administrator passphrase';
    expect(
      (
        await first.app.inject({
          method: 'POST',
          url: '/api/v1/auth/setup',
          headers: { 'x-leandocs-setup-token': setup.setupToken },
          payload: { username: 'admin', password, confirmPassword: password },
        })
      ).statusCode,
    ).toBe(201);
    const csrf = (await first.app.inject('/api/v1/auth/session')).json().csrfToken;
    const signed = await first.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { 'x-leandocs-csrf': csrf },
      payload: { username: 'admin', password },
    });
    const cookie = String(signed.headers['set-cookie']).split(';')[0]!;
    await first.app.close();
    apps.splice(apps.indexOf(first.app), 1);
    const proxy = await start({ DATA_DIR: first.dataDir });
    expect((await proxy.app.inject({ url: '/api/v1/tree', headers: { cookie } })).statusCode).toBe(
      401,
    );
    expect(
      (
        await proxy.app.inject({
          url: '/api/v1/tree',
          remoteAddress: '192.0.2.10',
          headers: { cookie },
        })
      ).statusCode,
    ).toBe(401);
    await proxy.app.close();
    apps.splice(apps.indexOf(proxy.app), 1);
    const local = await start({ DATA_DIR: first.dataDir, AUTH_MODE: 'local' });
    expect((await local.app.inject({ url: '/api/v1/tree', headers: { cookie } })).statusCode).toBe(
      200,
    );
    expect((await local.app.inject({ url: '/api/v1/tree', headers: identity })).statusCode).toBe(
      401,
    );
  });
});
