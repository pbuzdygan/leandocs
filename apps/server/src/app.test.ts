import { stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { APP_VERSION } from '@leandocs/shared';
import { describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { loadConfig } from './config/config.js';
import { makeTempDir } from './test/temp-dir.js';

async function testConfig(env: Record<string, string> = {}) {
  return loadConfig({ LOG_LEVEL: 'silent', DATA_DIR: await makeTempDir(), ...env });
}

describe('app', () => {
  it('GET /api/v1/health reports ok', async () => {
    const app = await buildApp(await testConfig());
    const res = await app.inject({ method: 'GET', url: '/api/v1/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok', name: 'LeanDocs', version: APP_VERSION });
    await app.close();
  });

  it('creates the SQLite index database in DATA_DIR/system', async () => {
    const config = await testConfig();
    const app = await buildApp(config);
    expect((await stat(path.join(config.dataDir, 'system', 'app.db'))).isFile()).toBe(true);
    await app.close();
  });

  it('returns the standard error body for unknown API routes', async () => {
    const app = await buildApp(await testConfig());
    const res = await app.inject({ method: 'GET', url: '/api/v1/nope' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: { code: 'NOT_FOUND', message: 'Not found' } });
    await app.close();
  });

  it('serves the web app with SPA fallback when WEB_DIST_DIR is set', async () => {
    const dir = await makeTempDir('leandocs-web-');
    await writeFile(path.join(dir, 'index.html'), '<!doctype html><title>LeanDocs</title>');
    const app = await buildApp(await testConfig({ WEB_DIST_DIR: dir }));

    const root = await app.inject({ method: 'GET', url: '/' });
    expect(root.statusCode).toBe(200);
    expect(root.body).toContain('LeanDocs');

    const deepLink = await app.inject({ method: 'GET', url: '/doc/some-id' });
    expect(deepLink.statusCode).toBe(200);
    expect(deepLink.headers['content-type']).toContain('text/html');

    const api = await app.inject({ method: 'GET', url: '/api/v1/missing' });
    expect(api.statusCode).toBe(404);
    await app.close();
  });
});
