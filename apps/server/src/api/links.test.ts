import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  BacklinksResponse,
  BrokenLinksResponse,
  OutgoingLinksResponse,
  TreeResponse,
} from '@leandocs/shared';
import Database from 'better-sqlite3';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../test/authenticated-app.js';
import { loadConfig } from '../config/config.js';
import { MIGRATIONS, migrate } from '../db/migrations.js';
import { makeTempDir } from '../test/temp-dir.js';

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

const FILES: Record<string, string> = {
  'Infrastructure/Servers/BUZHULK.md':
    '---\nid: buz\ntitle: BUZHULK\naliases: [hulk]\n---\n# BUZHULK\n\n## Hardware\n',
  'Applications/Home Assistant.md': [
    '---',
    'id: ha',
    'title: Home Assistant',
    '---',
    'Runs on [[BUZHULK]], see [[hulk#Hardware|the hardware]].',
    '',
    'Also [the server](../Infrastructure/Servers/BUZHULK.md) and [[Missing Doc]].',
    '',
    '[Old VLAN](../Network/Old-VLAN.md) · [web](https://example.com) · [[Home Assistant]]',
    '',
  ].join('\n'),
  'Network/UniFi.md': '---\nid: unifi\ntitle: UniFi\n---\nController for [[Home Assistant]].\n',
};

async function start(files: Record<string, string> = FILES): Promise<{
  app: FastifyInstance;
  dataDir: string;
}> {
  const dataDir = await makeTempDir();
  for (const [relative, content] of Object.entries(files)) {
    const file = path.join(dataDir, 'content', relative);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, content);
  }
  app = await buildApp(loadConfig({ LOG_LEVEL: 'silent', DATA_DIR: dataDir }));
  return { app, dataDir };
}

async function get<T>(instance: FastifyInstance, url: string): Promise<T> {
  const res = await instance.inject({ method: 'GET', url: `/api/v1${url}` });
  expect(res.statusCode).toBe(200);
  return res.json<T>();
}

describe('links API (P9-01…P9-04)', () => {
  it('lists outgoing links grouped by target, broken ones without a target', async () => {
    const { app } = await start();
    const { items } = await get<OutgoingLinksResponse>(app, '/documents/ha/links');
    expect(items).toEqual([
      {
        kind: 'wiki',
        raw: 'BUZHULK',
        target: { id: 'buz', title: 'BUZHULK', path: 'Infrastructure/Servers/BUZHULK.md' },
        count: 3, // title, alias with heading, relative Markdown link
      },
      { kind: 'wiki', raw: 'Missing Doc', target: null, count: 1 },
      { kind: 'markdown', raw: '../Network/Old-VLAN.md', target: null, count: 1 },
      {
        kind: 'wiki',
        raw: 'Home Assistant',
        target: { id: 'ha', title: 'Home Assistant', path: 'Applications/Home Assistant.md' },
        count: 1,
      },
    ]);
  });

  it('lists backlinks with counts, excluding self-links', async () => {
    const { app } = await start();
    expect((await get<BacklinksResponse>(app, '/documents/buz/backlinks')).items).toEqual([
      { id: 'ha', title: 'Home Assistant', path: 'Applications/Home Assistant.md', count: 3 },
    ]);
    expect((await get<BacklinksResponse>(app, '/documents/ha/backlinks')).items).toEqual([
      { id: 'unifi', title: 'UniFi', path: 'Network/UniFi.md', count: 1 },
    ]);
    const missing = await app.inject({ method: 'GET', url: '/api/v1/documents/nope/backlinks' });
    expect(missing.statusCode).toBe(404);
  });

  it('reports broken links and fixes them once the target exists', async () => {
    const { app } = await start();
    const source = { id: 'ha', title: 'Home Assistant', path: 'Applications/Home Assistant.md' };
    expect((await get<BrokenLinksResponse>(app, '/links/broken')).items).toEqual([
      { source, kind: 'wiki', raw: 'Missing Doc' },
      { source, kind: 'markdown', raw: '../Network/Old-VLAN.md' },
    ]);
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/documents',
      payload: { name: 'Missing Doc', content: 'Now exists.\n' },
    });
    expect(created.statusCode).toBe(201);
    expect((await get<BrokenLinksResponse>(app, '/links/broken')).items).toEqual([
      { source, kind: 'markdown', raw: '../Network/Old-VLAN.md' },
    ]);
    const id = created.json<{ id: string }>().id;
    expect((await get<BacklinksResponse>(app, `/documents/${id}/backlinks`)).items).toHaveLength(1);
  });

  it('exposes aliases in the tree for client-side resolution', async () => {
    const { app } = await start();
    const { root } = await get<TreeResponse>(app, '/tree');
    const infrastructure = root.children.find((node) => node.name === 'Infrastructure');
    expect(JSON.stringify(infrastructure)).toContain('"aliases":["hulk"]');
  });
});

describe('migration 2', () => {
  it('adds the links table and drops v1 index rows so the next start re-reads files', () => {
    const db = new Database(':memory:');
    migrate(db, MIGRATIONS.slice(0, 1));
    db.prepare(
      `INSERT INTO documents (id, id_source, path, filename, title, mtime_ms, size, content_hash)
       VALUES ('a', 'frontmatter', 'A.md', 'A.md', 'A', 1, 1, 'sha256:x')`,
    ).run();
    db.prepare("INSERT INTO settings VALUES ('theme', 'dark', 'now')").run();
    expect(migrate(db, MIGRATIONS.slice(0, 2)).applied).toEqual(['2: document links; reindex']);
    expect(db.prepare('SELECT count(*) FROM documents').pluck().get()).toBe(0);
    expect(db.prepare('SELECT count(*) FROM settings').pluck().get()).toBe(1);
    expect(db.prepare('SELECT count(*) FROM links').pluck().get()).toBe(0);
  });
});
