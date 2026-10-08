import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { PinsResponse } from '@leandocs/shared';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../test/authenticated-app.js';
import { loadConfig } from '../config/config.js';
import { makeTempDir } from '../test/temp-dir.js';

/** P10-05 (PROJECT_SPEC §40). */

const apps: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

async function setup() {
  const dataDir = await makeTempDir();
  const content = path.join(dataDir, 'content');
  await mkdir(path.join(content, 'Servers'), { recursive: true });
  await writeFile(path.join(content, 'Servers', 'A.md'), '---\nid: a\ntitle: Alpha\n---\nA\n');
  await writeFile(path.join(content, 'B.md'), '---\nid: b\ntitle: Beta\n---\nB\n');
  const start = async () => {
    const app = await buildApp(loadConfig({ LOG_LEVEL: 'silent', DATA_DIR: dataDir }));
    apps.push(app);
    return app;
  };
  return { content, start };
}

const list = async (app: FastifyInstance) =>
  (await app.inject({ method: 'GET', url: '/api/v1/pins' })).json<PinsResponse>().items;

describe('pins', () => {
  it('pins and unpins documents without touching their files', async () => {
    const { content, start } = await setup();
    const app = await start();
    const before = await readFile(path.join(content, 'B.md'), 'utf8');
    expect((await app.inject({ method: 'PUT', url: '/api/v1/pins/b' })).statusCode).toBe(204);
    expect((await app.inject({ method: 'PUT', url: '/api/v1/pins/a' })).statusCode).toBe(204);
    expect((await app.inject({ method: 'PUT', url: '/api/v1/pins/b' })).statusCode).toBe(204);
    expect((await list(app)).map((item) => item.id)).toEqual(['b', 'a']);
    expect(await readFile(path.join(content, 'B.md'), 'utf8')).toBe(before);
    await app.inject({ method: 'DELETE', url: '/api/v1/pins/b' });
    expect(await list(app)).toEqual([{ id: 'a', title: 'Alpha', path: 'Servers/A.md' }]);
    expect((await app.inject({ method: 'PUT', url: '/api/v1/pins/nope' })).statusCode).toBe(404);
  });

  it('survive restarts, moves and index rebuilds; trashed documents reappear on restore', async () => {
    const { start } = await setup();
    const app = await start();
    await app.inject({ method: 'PUT', url: '/api/v1/pins/a' });
    await app.inject({
      method: 'POST',
      url: '/api/v1/documents/a/move',
      payload: { folder: '' },
    });
    await app.inject({ method: 'POST', url: '/api/v1/index/rebuild' });
    for (let i = 0; i < 100; i++) {
      const status = await app.inject({ method: 'GET', url: '/api/v1/index/status' });
      if (status.json<{ rebuild: { state: string } }>().rebuild.state !== 'running') break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect((await list(app)).map((item) => item.path)).toEqual(['A.md']);

    const trashed = await app.inject({ method: 'DELETE', url: '/api/v1/documents/a' });
    expect(await list(app)).toEqual([]);
    await app.inject({
      method: 'POST',
      url: `/api/v1/trash/${trashed.json<{ trashId: string }>().trashId}/restore`,
    });
    expect((await list(app)).map((item) => item.id)).toEqual(['a']);

    await app.close();
    apps.splice(apps.indexOf(app), 1);
    expect((await list(await start())).map((item) => item.id)).toEqual(['a']);
  });
});
