import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import Database from 'better-sqlite3';
import type { FastifyInstance } from 'fastify';
import type { SetupStatus } from '@leandocs/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/config.js';
import { makeTempDir } from '../test/temp-dir.js';
import { verifyPassword } from '../auth/password.js';

const apps: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});
const input = {
  username: ' admin ',
  password: 'a long administrator password',
  confirmPassword: 'a long administrator password',
};

async function start(existingDir?: string) {
  const dataDir = existingDir ?? (await makeTempDir());
  const app = await buildApp(
    loadConfig({ DATA_DIR: dataDir, LOG_LEVEL: 'silent', ASSIGN_MISSING_IDS: 'false' }),
  );
  apps.push(app);
  const response = await app.inject('/api/v1/auth/setup');
  const status = response.json<SetupStatus>();
  const headers = { 'x-leandocs-setup-token': status.required ? status.setupToken : '' };
  return { app, dataDir, response, status, headers };
}

describe('first-run setup', () => {
  it('creates the account once, preserves documents, and persists across restart', async () => {
    const dataDir = await makeTempDir();
    const file = path.join(dataDir, 'content', 'Guide.md');
    await mkdir(path.dirname(file), { recursive: true });
    const markdown = '# My original documentation\n';
    await writeFile(file, markdown);
    const { app, status, response, headers } = await start(dataDir);
    expect(status).toMatchObject({ required: true, contentDir: path.dirname(file) });
    expect(response.headers['cache-control']).toBe('no-store');
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/setup',
      headers,
      payload: input,
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toEqual({ required: false, contentDir: path.dirname(file) });
    expect(created.body).not.toContain(input.password);
    expect(created.headers['set-cookie']).toBeUndefined();
    expect(await readFile(file, 'utf8')).toBe(markdown);
    const db = new Database(path.join(dataDir, 'system', 'app.db'));
    try {
      const user = db.prepare('SELECT username, password_hash FROM users').get() as {
        username: string;
        password_hash: string;
      };
      expect(user.username).toBe('admin');
      expect(user.password_hash).not.toContain(input.password);
      expect(await verifyPassword(input.password, user.password_hash)).toBe(true);
    } finally {
      db.close();
    }
    await app.close();
    apps.splice(apps.indexOf(app), 1);
    const restarted = await start(dataDir);
    expect(restarted.status.required).toBe(false);
    const replacement = await restarted.app.inject({
      method: 'POST',
      url: '/api/v1/auth/setup',
      headers,
      payload: { ...input, username: 'replacement' },
    });
    expect(replacement.statusCode).toBe(409);
    expect(replacement.json().error.code).toBe('SETUP_COMPLETE');
  });

  it('rejects invalid credentials and request schemas without creating an account', async () => {
    const { app, headers } = await start();
    for (const payload of [
      { ...input, username: '../admin' },
      { ...input, username: ' ' },
      { ...input, password: 'short' },
      { ...input, confirmPassword: 'different' },
      { ...input, password: '🔐'.repeat(257), confirmPassword: '🔐'.repeat(257) },
      { ...input, password: 'a'.repeat(15) + '\ud800', confirmPassword: 'a'.repeat(15) + '\ud800' },
      { ...input, extra: 'not permitted' },
      { username: 'admin', password: 123, confirmPassword: input.password },
      { username: 'admin', password: input.password },
    ]) {
      const result = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/setup',
        headers,
        payload,
      });
      expect(result.statusCode).toBe(400);
      expect(result.body).not.toContain(input.password);
    }
    expect((await app.inject('/api/v1/auth/setup')).json().required).toBe(true);
  });

  it('requires the current request token, blocks cross-site requests and bounds request size', async () => {
    const { app, headers } = await start();
    for (const token of ['', 'wrong', '0'.repeat(64)]) {
      const result = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/setup',
        headers: { 'x-leandocs-setup-token': token },
        payload: input,
      });
      expect(result.statusCode).toBe(403);
    }
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/auth/setup',
          headers: { ...headers, 'sec-fetch-site': 'cross-site' },
          payload: input,
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/auth/setup',
          headers: { ...headers, 'content-type': 'text/plain' },
          payload: JSON.stringify(input),
        })
      ).statusCode,
    ).toBe(415);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/auth/setup',
          headers,
          payload: { ...input, password: 'a'.repeat(20000) },
        })
      ).statusCode,
    ).toBe(413);
    expect((await app.inject('/api/v1/auth/setup')).json().required).toBe(true);
  });

  it('allows only one concurrent account creation', async () => {
    const { app, headers } = await start();
    const results = await Promise.all(
      [0, 1].map(() =>
        app.inject({ method: 'POST', url: '/api/v1/auth/setup', headers, payload: input }),
      ),
    );
    expect(results.map((result) => result.statusCode).sort()).toEqual([201, 409]);
  });
});
