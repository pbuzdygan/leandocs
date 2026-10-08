import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/config.js';
import { makeTempDir } from '../test/temp-dir.js';

const apps: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

async function start(extra: NodeJS.ProcessEnv = {}) {
  const webDistDir = await makeTempDir();
  await writeFile(path.join(webDistDir, 'index.html'), '<!doctype html><title>LeanDocs</title>');
  await writeFile(path.join(webDistDir, 'app.js'), 'window.ready = true;');
  const app = await buildApp(
    loadConfig({
      DATA_DIR: await makeTempDir(),
      WEB_DIST_DIR: webDistDir,
      LOG_LEVEL: 'silent',
      ...extra,
    }),
  );
  apps.push(app);
  return app;
}

function policy(value: string) {
  return Object.fromEntries(
    value.split(';').map((part) => {
      const [name, ...sources] = part.trim().split(/\s+/);
      return [name, sources];
    }),
  );
}

function headers(value: Record<string, unknown>) {
  expect(value['x-content-type-options']).toBe('nosniff');
  expect(value['x-frame-options']).toBe('DENY');
  expect(value['referrer-policy']).toBe('no-referrer');
  expect(value['permissions-policy']).toBe('camera=(), microphone=(), geolocation=()');
  expect(value['cross-origin-resource-policy']).toBe('same-origin');
  const csp = policy(String(value['content-security-policy']));
  expect(csp['default-src']).toEqual(["'none'"]);
  expect(csp['script-src']).toEqual(["'self'"]);
  expect(csp['script-src-attr']).toEqual(["'none'"]);
  for (const directive of ['object-src', 'frame-src', 'frame-ancestors', 'base-uri', 'worker-src'])
    expect(csp[directive]).toEqual(["'none'"]);
  for (const directive of ['connect-src', 'manifest-src', 'form-action'])
    expect(csp[directive]).toEqual(["'self'"]);
  expect(csp['font-src']).toEqual(["'self'", 'data:']);
  expect(csp['style-src']).toEqual(["'self'", "'unsafe-inline'"]);
  expect(csp['img-src']).toEqual(["'self'", 'data:', 'http:', 'https:']);
}

describe('security headers', () => {
  it('protects HTML/SPA, static files, HEAD, API status, auth failures, validation and unknown routes', async () => {
    const app = await start();
    for (const [url, status] of [
      ['/', 200],
      ['/doc/deep-link', 200],
      ['/app.js', 200],
      ['/api/v1/health', 200],
      ['/api/v1/auth/session', 200],
      ['/api/v1/tree', 401],
      ['/api/v1/missing', 404],
    ] as const) {
      const response = await app.inject({ url });
      expect(response.statusCode).toBe(status);
      headers(response.headers);
      expect(response.headers['strict-transport-security']).toBeUndefined();
    }
    const head = await app.inject({ method: 'HEAD', url: '/app.js' });
    expect(head.body).toBe('');
    headers(head.headers);
    const session = (await app.inject('/api/v1/auth/session')).json();
    for (const [token, status] of [
      ['bad', 403],
      [session.csrfToken, 400],
    ] as const) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        headers: { 'x-leandocs-csrf': token },
        payload: {},
      });
      expect(response.statusCode).toBe(status);
      headers(response.headers);
    }
  });

  it('uses the same policy in proxy and none modes, including disabled auth endpoints', async () => {
    for (const mode of ['proxy', 'none']) {
      const app = await start({
        AUTH_MODE: mode,
        PROXY_TRUSTED_IPS: '192.0.2.10',
        PROXY_AUTH_HEADER: 'x-auth-request-user',
        PROXY_AUTH_USER: 'owner',
      });
      headers((await app.inject('/')).headers);
      const disabled = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: {} });
      expect(disabled.statusCode).toBe(403);
      headers(disabled.headers);
    }
  });

  it('enables HSTS only for explicit HTTPS deployments, ignoring forged forwarding headers', async () => {
    const app = await start();
    const forged = await app.inject({
      url: '/',
      headers: { 'x-forwarded-proto': 'https', forwarded: 'proto=https' },
    });
    expect(forged.headers['strict-transport-security']).toBeUndefined();
    const secure = await start({
      SESSION_COOKIE_SECURE: 'true',
      PUBLIC_ORIGIN: 'https://docs.example.com',
    });
    for (const url of ['/', '/app.js', '/api/v1/health', '/api/v1/tree']) {
      const response = await secure.inject({ url, headers: { host: 'docs.example.com' } });
      expect(response.headers['strict-transport-security']).toBe('max-age=31536000');
      headers(response.headers);
    }
  });

  it('retains sandboxed SVG and download CSP instead of replacing it with application script permissions', async () => {
    const dataDir = await makeTempDir();
    const contentDir = path.join(dataDir, 'content');
    const app = await buildApp(
      loadConfig({ DATA_DIR: dataDir, AUTH_MODE: 'none', LOG_LEVEL: 'silent' }),
    );
    apps.push(app);
    const token = (await app.inject('/api/v1/auth/session')).json().csrfToken;
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/documents',
      headers: { 'x-leandocs-csrf': token },
      payload: { name: 'Protected Asset' },
    });
    const id = created.json().id;
    const { mkdir } = await import('node:fs/promises');
    const assets = path.join(contentDir, 'Protected Asset.assets');
    await mkdir(assets);
    await writeFile(
      path.join(assets, 'active.svg'),
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    );
    await writeFile(path.join(assets, 'notes.txt'), 'download');
    for (const filename of ['active.svg', 'notes.txt']) {
      const response = await app.inject(`/api/v1/documents/${id}/attachments/${filename}`);
      expect(response.statusCode).toBe(200);
      const csp = policy(String(response.headers['content-security-policy']));
      expect(csp.sandbox).toEqual([]);
      expect(csp['script-src']).toEqual(["'none'"]);
      expect(csp['default-src']).toEqual(["'none'"]);
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBe('DENY');
      expect(response.headers['referrer-policy']).toBe('no-referrer');
      expect(response.headers['cross-origin-resource-policy']).toBe('same-origin');
    }
  });
});
