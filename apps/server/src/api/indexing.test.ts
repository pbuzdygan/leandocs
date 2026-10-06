import Database from 'better-sqlite3';
import { IndexStore } from '../documents/index-store.js';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { IndexStatusResponse, SearchResponse } from '@leandocs/shared';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../test/authenticated-app.js';
import { loadConfig } from '../config/config.js';
import { makeTempDir } from '../test/temp-dir.js';

const apps: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

async function writeDocs(dataDir: string, count: number): Promise<void> {
  for (let i = 0; i < count; i++) {
    const file = path.join(dataDir, 'content', `Folder ${i % 3}`, `Doc ${i}.md`);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, `---\nid: doc-${i}\ntags: [t${i % 2}]\n---\nsearchable body ${i}\n`);
  }
}

async function start(dataDir: string): Promise<FastifyInstance> {
  const app = await buildApp(loadConfig({ LOG_LEVEL: 'silent', DATA_DIR: dataDir }));
  apps.push(app);
  return app;
}

async function status(app: FastifyInstance): Promise<IndexStatusResponse> {
  const res = await app.inject({ method: 'GET', url: '/api/v1/index/status' });
  expect(res.statusCode).toBe(200);
  return res.json<IndexStatusResponse>();
}

async function rebuildAndWait(app: FastifyInstance): Promise<IndexStatusResponse> {
  const res = await app.inject({ method: 'POST', url: '/api/v1/index/rebuild' });
  expect(res.statusCode).toBe(202);
  for (let i = 0; i < 200; i++) {
    const current = await status(app);
    if (current.rebuild.state !== 'running') return current;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('rebuild did not finish');
}

async function hits(app: FastifyInstance, q: string): Promise<number> {
  const res = await app.inject({ method: 'GET', url: '/api/v1/search', query: { q, limit: '50' } });
  return res.json<SearchResponse>().results.length;
}

describe('index status and rebuild (P8-04)', () => {
  it('reports counts, storage and rebuild state', async () => {
    const dataDir = await makeTempDir();
    await writeDocs(dataDir, 4);
    const assets = path.join(dataDir, 'content', 'Folder 0', 'Doc 0.assets');
    await mkdir(assets);
    await writeFile(path.join(assets, 'a.png'), Buffer.alloc(1234));
    const app = await start(dataDir);

    const current = await status(app);
    expect(current).toMatchObject({
      documents: 4,
      folders: 3,
      tags: 2,
      issues: [],
      storage: {
        dataDir,
        contentDir: path.join(dataDir, 'content'),
        attachmentsBytes: 1234,
      },
      rebuild: { state: 'idle', lastRebuildAt: null },
    });
    expect(current.storage.databaseBytes).toBeGreaterThan(0);
  });

  it('rebuilds in the background, reports progress totals and records the time', async () => {
    const dataDir = await makeTempDir();
    await writeDocs(dataDir, 12);
    const app = await start(dataDir);
    const done = await rebuildAndWait(app);
    expect(done.rebuild).toMatchObject({ state: 'idle', done: 12, total: 12 });
    expect(done.rebuild.lastRebuildAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(done.documents).toBe(12);
    expect(await hits(app, 'searchable')).toBe(12);
  });

  it('joins a running rebuild instead of starting a second one', async () => {
    const dataDir = await makeTempDir();
    await writeDocs(dataDir, 30);
    const app = await start(dataDir);
    const [first, second] = await Promise.all([
      app.inject({ method: 'POST', url: '/api/v1/index/rebuild' }),
      app.inject({ method: 'POST', url: '/api/v1/index/rebuild' }),
    ]);
    expect(first.statusCode).toBe(202);
    expect(second.statusCode).toBe(202);
    expect(second.json<IndexStatusResponse['rebuild']>().state).toBe('running');
    const finished = await rebuildAndWait(app);
    expect(finished.documents).toBe(30);
  });

  it('waits for a running rebuild before closing the database', async () => {
    const dataDir = await makeTempDir();
    await writeDocs(dataDir, 60);
    const app = await start(dataDir);
    await app.inject({ method: 'POST', url: '/api/v1/index/rebuild' });
    await app.close();
    apps.splice(apps.indexOf(app), 1);
    const reopened = await start(dataDir);
    const current = await status(reopened);
    expect(current.documents).toBe(60);
    expect(current.rebuild.lastRebuildAt).not.toBeNull();
  });

  it('critical test B: clearing derived tables restores search without deleting authentication', async () => {
    const dataDir = await makeTempDir();
    await writeDocs(dataDir, 5);
    const first = await start(dataDir);
    expect(await hits(first, 'searchable')).toBe(5);
    await first.close();
    apps.splice(apps.indexOf(first), 1);

    const db = new Database(path.join(dataDir, 'system', 'app.db'));
    try {
      db.pragma('foreign_keys = ON');
      new IndexStore(db).clear();
      expect(db.prepare('SELECT username FROM users').get()).toEqual({ username: 'test-admin' });
    } finally {
      db.close();
    }

    const second = await start(dataDir);
    // The cleared index is filled on startup; an explicit rebuild gives the same result.
    expect(await hits(second, 'searchable')).toBe(5);
    const rebuilt = await rebuildAndWait(second);
    expect(rebuilt.documents).toBe(5);
    expect(await hits(second, 'searchable')).toBe(5);
    expect(await hits(second, 't1')).toBe(2);
  });
});
