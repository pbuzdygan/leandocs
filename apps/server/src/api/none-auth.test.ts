import path from 'node:path';
import { once } from 'node:events';
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
async function start(extra: NodeJS.ProcessEnv = {}) {
  const dataDir = extra.DATA_DIR ?? (await makeTempDir());
  const routes: RouteOptions[] = [];
  const app = await buildApp(
    loadConfig({ DATA_DIR: dataDir, LOG_LEVEL: 'silent', AUTH_MODE: 'none', ...extra }),
    (route) => routes.push(route),
  );
  apps.push(app);
  return { app, dataDir, routes };
}

describe('deliberate unauthenticated mode', () => {
  it('opens content APIs without a user/cookie and retains normal validation', async () => {
    const { app, dataDir, routes } = await start();
    const session = await app.inject('/api/v1/auth/session');
    expect(session.json()).toMatchObject({ authMode: 'none', user: null });
    expect(session.json().csrfToken).toMatch(/^[a-f0-9]{64}$/);
    expect(session.headers['set-cookie']).toBeUndefined();
    expect(session.headers['cache-control']).toBe('no-store');
    const headers = { 'x-leandocs-csrf': session.json().csrfToken };
    const created = await app.inject({
      headers,
      method: 'POST',
      url: '/api/v1/documents',
      payload: { name: 'Open Guide', content: 'Open documentation.' },
    });
    expect(created.statusCode).toBe(201);
    const { id, revision } = created.json();
    expect((await app.inject(`/api/v1/documents/${id}`)).statusCode).toBe(200);
    expect(
      (
        await app.inject({
          headers,
          method: 'PUT',
          url: `/api/v1/documents/${id}`,
          payload: { content: 'Updated.', expectedRevision: revision },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (await app.inject({ method: 'POST', url: '/api/v1/documents', headers, payload: {} }))
        .statusCode,
    ).toBe(400);
    expect((await app.inject('/api/v1/documents/not-a-uuid')).statusCode).toBe(404);
    expect((await app.inject(`/api/v1/documents/${id}/attachments`)).statusCode).toBe(200);
    expect(
      (await app.inject({ method: 'DELETE', headers, url: `/api/v1/documents/${id}` })).statusCode,
    ).toBe(200);
    let count = 0;
    for (const route of routes) {
      if (!route.url.startsWith('/api/v1/') || route.url.startsWith('/api/v1/auth/')) continue;
      for (const method of Array.isArray(route.method) ? route.method : [route.method]) {
        const response = await app.inject({
          method: method as 'GET' | 'HEAD' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'OPTIONS',
          headers,
          url: route.url.replace(/:[^/]+/g, 'example'),
          payloadAsStream: route.url === '/api/v1/events',
        });
        expect(response.statusCode, `${method} ${route.url}`).not.toBe(401);
        expect(response.statusCode, `${method} ${route.url}`).toBeLessThan(500);
        if (route.url === '/api/v1/events') {
          // An SSE response stays open: verify its first event instead of buffering to EOF.
          expect(response.headers['content-type']).toContain('text/event-stream');
          const stream = response.stream();
          const [chunk] = await once(stream, 'data');
          expect(String(chunk)).toContain('event: ready');
          stream.destroy();
          response.raw.res.destroy();
        }
        count++;
      }
    }
    expect(count).toBeGreaterThan(35);
    const db = new Database(path.join(dataDir, 'system/app.db'));
    try {
      expect(db.prepare('SELECT count(*) AS n FROM users').get()).toEqual({ n: 0 });
      expect(db.prepare('SELECT count(*) AS n FROM sessions').get()).toEqual({ n: 0 });
    } finally {
      db.close();
    }
  });

  it('skips setup and disables credential endpoints before parsing', async () => {
    const { app } = await start();
    expect((await app.inject('/api/v1/auth/setup')).json()).toMatchObject({
      required: false,
      authMode: 'none',
    });
    expect((await app.inject('/api/v1/auth/setup')).json().setupToken).toBeUndefined();
    for (const endpoint of ['setup', 'login', 'logout']) {
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/auth/${endpoint}`,
        headers: { 'content-type': 'application/json' },
        payload: '{bad json',
      });
      expect(response.statusCode).toBe(403);
      expect(response.json().error.code).toBe('AUTH_DISABLED');
      expect(response.headers['set-cookie']).toBeUndefined();
    }
  });

  it('requires explicit opt-in; switching modes preserves local credentials', async () => {
    const first = await start({ AUTH_MODE: 'local' });
    expect((await first.app.inject('/api/v1/tree')).statusCode).toBe(401);
    const setup = (await first.app.inject('/api/v1/auth/setup')).json();
    const password = 'a preserved administrator passphrase';
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
    await first.app.close();
    apps.splice(apps.indexOf(first.app), 1);
    const none = await start({ DATA_DIR: first.dataDir });
    expect((await none.app.inject('/api/v1/tree')).statusCode).toBe(200);
    expect(
      (
        await none.app.inject({
          url: '/api/v1/auth/session',
          headers: { cookie: 'leandocs_session=forged', 'x-auth-request-user': 'fake' },
        })
      ).json().user,
    ).toBeNull();
    await none.app.close();
    apps.splice(apps.indexOf(none.app), 1);
    const local = await start({ DATA_DIR: first.dataDir, AUTH_MODE: '' });
    expect((await local.app.inject('/api/v1/tree')).statusCode).toBe(401);
    expect((await local.app.inject('/api/v1/auth/setup')).json().required).toBe(false);
    const csrf = (await local.app.inject('/api/v1/auth/session')).json().csrfToken;
    expect(
      (
        await local.app.inject({
          method: 'POST',
          url: '/api/v1/auth/login',
          headers: { 'x-leandocs-csrf': csrf },
          payload: { username: 'admin', password },
        })
      ).statusCode,
    ).toBe(200);
  });
});
