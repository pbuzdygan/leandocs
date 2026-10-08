import { chmod, mkdir, rm, utimes, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { openDatabase } from '../db/database.js';
import { makeTempDir, silentLogger } from '../test/temp-dir.js';
import { DocumentRegistry } from './registry.js';

/**
 * P8-02: the registry keeps the SQLite index (documents, tags, aliases, FTS) in step with the
 * filesystem, reconciles incrementally after a restart and can rebuild from scratch.
 */

const ID_A = '77ce39fd-03cd-4d78-9e8f-87828449e0aa';
const ID_B = '0b9c8f43-4f0b-4a43-9c55-0f4c41d5e2b1';

async function put(root: string, relative: string, content: string): Promise<string> {
  const file = path.join(root, relative);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content);
  return file;
}

async function setup() {
  const dir = await makeTempDir();
  const content = path.join(dir, 'content');
  const system = path.join(dir, 'system');
  await mkdir(content);
  await mkdir(system);
  const db = openDatabase(system, silentLogger);
  const open = async (database: Database.Database = db) => {
    const registry = new DocumentRegistry(content, {
      assignMissingIds: true,
      logger: silentLogger,
      db: database,
    });
    await registry.refresh();
    return registry;
  };
  return { content, system, db, open };
}

function search(db: Database.Database, query: string): string[] {
  return (
    db
      .prepare(
        `SELECT d.path FROM documents_fts JOIN documents d ON d.key = documents_fts.rowid
         WHERE documents_fts MATCH ? ORDER BY d.path`,
      )
      .all(query) as { path: string }[]
  ).map((row) => row.path);
}

function count(db: Database.Database, table: string): number {
  return (db.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n;
}

const SERVER = [
  '---',
  `id: ${ID_A}`,
  'title: BUZHULK',
  'description: Main Incus host',
  'tags: [server, Docker, "#lab", docker]',
  'aliases: [hulk, main-host]',
  'created: 2026-01-01T10:00:00Z',
  '---',
  '# BUZHULK',
  '',
  '## Networking',
  '',
  'The Incus VM uses **macvlan** for host communication.',
  '',
].join('\n');

describe('document index (SQLite)', () => {
  it('stores documents, tags, aliases and full-text rows', async () => {
    const { content, db, open } = await setup();
    await put(content, 'Infrastructure/BUZHULK.md', SERVER);
    await open();

    expect(db.prepare('SELECT * FROM documents').get()).toMatchObject({
      id: ID_A,
      id_source: 'frontmatter',
      path: 'Infrastructure/BUZHULK.md',
      filename: 'BUZHULK.md',
      title: 'BUZHULK',
      description: 'Main Incus host',
      created_at: '2026-01-01T10:00:00Z',
      content_hash: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
    });
    expect(db.prepare('SELECT name FROM tags ORDER BY name').pluck().all()).toEqual([
      'Docker',
      'lab',
      'server',
    ]);
    expect(db.prepare('SELECT alias FROM document_aliases ORDER BY alias').pluck().all()).toEqual([
      'hulk',
      'main-host',
    ]);
    expect(search(db, 'macvlan')).toEqual(['Infrastructure/BUZHULK.md']);
    expect(search(db, 'headings:networking')).toEqual(['Infrastructure/BUZHULK.md']);
    expect(search(db, 'aliases:hulk')).toEqual(['Infrastructure/BUZHULK.md']);
    expect(search(db, 'tags:docker')).toEqual(['Infrastructure/BUZHULK.md']);
    expect(search(db, 'path:infrastructure')).toEqual(['Infrastructure/BUZHULK.md']);
    // Markup is not indexed as words.
    expect(search(db, 'body:bold')).toEqual([]);
  });

  it('updates search results when a document changes (Phase 8 acceptance)', async () => {
    const { content, db, open } = await setup();
    const file = await put(content, 'Note.md', `---\nid: ${ID_A}\n---\nold phrase zebra\n`);
    const registry = await open();
    expect(search(db, 'zebra')).toEqual(['Note.md']);

    await writeFile(file, `---\nid: ${ID_A}\ntags: [fresh]\n---\nnew phrase giraffe\n`);
    await utimes(file, new Date(), new Date(Date.now() + 5000));
    await registry.refresh();
    expect(search(db, 'zebra')).toEqual([]);
    expect(search(db, 'giraffe')).toEqual(['Note.md']);
    expect(db.prepare('SELECT name FROM tags').pluck().all()).toEqual(['fresh']);
    expect(count(db, 'documents_fts')).toBe(1);
  });

  it('removes rows, orphaned tags and FTS entries of deleted documents', async () => {
    const { content, db, open } = await setup();
    const file = await put(content, 'Gone.md', `---\nid: ${ID_A}\ntags: [temp]\n---\nunique\n`);
    await put(content, 'Stays.md', `---\nid: ${ID_B}\n---\nother\n`);
    const registry = await open();
    await rm(file);
    await registry.refresh();
    expect(db.prepare('SELECT path FROM documents').pluck().all()).toEqual(['Stays.md']);
    expect(count(db, 'tags')).toBe(0);
    expect(count(db, 'documents_fts')).toBe(1);
    expect(search(db, 'unique')).toEqual([]);
  });

  it('follows renames without leaving stale rows', async () => {
    const { content, db, open } = await setup();
    await put(content, 'A.md', `---\nid: ${ID_A}\n---\nbody\n`);
    const registry = await open();
    await rm(path.join(content, 'A.md'));
    await put(content, 'Folder/B.md', `---\nid: ${ID_A}\n---\nbody\n`);
    await registry.refresh();
    expect(db.prepare('SELECT id, path FROM documents').all()).toEqual([
      { id: ID_A, path: 'Folder/B.md' },
    ]);
  });

  it('re-keys a document whose id changes because a duplicate disappeared', async () => {
    const { content, db, open } = await setup();
    const first = await put(content, 'A.md', `---\nid: ${ID_A}\n---\nfirst\n`);
    await put(content, 'B.md', `---\nid: ${ID_A}\n---\nsecond\n`);
    const registry = await open();
    expect(registry.findByPath('B.md')?.idSource).toBe('provisional');
    await rm(first);
    await registry.refresh();
    expect(db.prepare('SELECT id, id_source, path FROM documents').all()).toEqual([
      { id: ID_A, id_source: 'frontmatter', path: 'B.md' },
    ]);
    expect(search(db, 'second')).toEqual(['B.md']);
  });

  it('keeps the index consistent with the registry', async () => {
    const { content, db, open } = await setup();
    await put(content, 'Plain.md', '# Plain\n\nno front matter\n');
    await put(content, 'Broken.md', '---\nid: [unclosed\n---\nbody\n');
    await put(content, 'Folder/Ok.md', `---\nid: ${ID_B}\n---\nok\n`);
    const registry = await open();
    const rows = db.prepare('SELECT id, path, title FROM documents ORDER BY path').all();
    expect(rows).toEqual(
      registry.list().map((entry) => ({ id: entry.id, path: entry.path, title: entry.title })),
    );
  });

  it.skipIf(process.getuid?.() === 0)(
    'does not re-read unchanged files after a restart (incremental reconcile)',
    async () => {
      const { content, db, open } = await setup();
      const file = await put(content, 'Doc.md', `---\nid: ${ID_A}\n---\nkept\n`);
      await open();
      await chmod(file, 0o000); // any read attempt would now fail with UNREADABLE
      try {
        const restarted = await open();
        expect(restarted.issues()).toEqual([]);
        expect(restarted.get(ID_A)?.path).toBe('Doc.md');
        expect(search(db, 'kept')).toEqual(['Doc.md']);
      } finally {
        await chmod(file, 0o644);
      }
    },
  );

  it('picks up changes made while the server was stopped', async () => {
    const { content, db, system, open } = await setup();
    const file = await put(content, 'Doc.md', `---\nid: ${ID_A}\n---\nbefore\n`);
    await open();
    db.close();

    await writeFile(file, `---\nid: ${ID_A}\n---\nafter offline edit\n`);
    await utimes(file, new Date(), new Date(Date.now() + 5000));
    await put(content, 'New.md', `---\nid: ${ID_B}\n---\nadded offline\n`);
    const reopened = openDatabase(system, silentLogger);
    try {
      await open(reopened);
      expect(search(reopened, 'before')).toEqual([]);
      expect(search(reopened, 'offline')).toEqual(['Doc.md', 'New.md']);
    } finally {
      reopened.close();
    }
  });

  it('rebuilds from scratch and keeps app settings', async () => {
    const { content, db, open } = await setup();
    await put(content, 'Doc.md', `---\nid: ${ID_A}\ntags: [a]\n---\nrebuild me\n`);
    const registry = await open();
    db.prepare("INSERT INTO settings VALUES ('theme', 'dark', 'now')").run();
    db.exec('DELETE FROM documents_fts'); // simulate a damaged index

    await registry.rebuild();
    expect(search(db, 'rebuild')).toEqual(['Doc.md']);
    expect(count(db, 'documents')).toBe(1);
    expect(count(db, 'tags')).toBe(1);
    expect(db.prepare('SELECT value FROM settings').pluck().get()).toBe('dark');
    expect(registry.store.getMeta('lastRebuildAt')).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('restores the full index into a brand-new database (app.db deleted)', async () => {
    const { content, db, system, open } = await setup();
    await put(content, 'Doc.md', `---\nid: ${ID_A}\n---\nsurvives deletion\n`);
    await open();
    db.close();
    for (const suffix of ['', '-wal', '-shm'])
      await rm(path.join(system, `app.db${suffix}`), { force: true });

    const fresh = openDatabase(system, silentLogger);
    try {
      const registry = await open(fresh);
      expect(registry.get(ID_A)?.path).toBe('Doc.md');
      expect(search(fresh, 'survives')).toEqual(['Doc.md']);
    } finally {
      fresh.close();
    }
  });
});
