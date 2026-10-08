import * as fs from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openDatabase } from '../db/database.js';
import { makeTempDir, silentLogger } from '../test/temp-dir.js';
import { DocumentRegistry, provisionalId } from './registry.js';

vi.mock('node:fs/promises', { spy: true });

const ID = '77ce39fd-03cd-4d78-9e8f-87828449e0aa';
const source = (body: string) => `---\nid: ${ID}\ntags: [external]\n---\n${body}\n`;
afterEach(() => vi.clearAllMocks());

async function setup() {
  const root = await makeTempDir();
  const content = path.join(root, 'content');
  const system = path.join(root, 'system');
  await fs.mkdir(content);
  await fs.mkdir(system);
  const db = openDatabase(system, silentLogger);
  const registry = new DocumentRegistry(content, {
    assignMissingIds: false,
    logger: silentLogger,
    db,
  });
  return { content, db, registry };
}

describe('path-targeted indexing', () => {
  it('updates search and reports same-size, same-timestamp edits without walking unrelated folders', async () => {
    const { content, db, registry } = await setup();
    await fs.mkdir(path.join(content, 'Other'));
    await fs.writeFile(path.join(content, 'Other/B.md'), '# Unrelated\n');
    const file = path.join(content, 'A.md');
    const time = new Date('2026-01-01T00:00:00Z');
    await fs.writeFile(file, source('zebra'));
    await fs.utimes(file, time, time);
    await registry.refresh();
    await fs.writeFile(file, source('tiger'));
    await fs.utimes(file, time, time);
    vi.clearAllMocks();

    const changes = await registry.refresh(['A.md']);

    expect(changes.documents).toEqual([{ kind: 'changed', id: ID, path: 'A.md' }]);
    expect(fs.readdir).not.toHaveBeenCalled();
    expect(fs.readFile).toHaveBeenCalledExactlyOnceWith(file);
    expect(fs.lstat).toHaveBeenCalledExactlyOnceWith(file);
    expect(
      db
        .prepare('SELECT count(*) AS n FROM documents_fts WHERE documents_fts MATCH ?')
        .get('tiger'),
    ).toEqual({ n: 1 });
    expect(
      db
        .prepare('SELECT count(*) AS n FROM documents_fts WHERE documents_fts MATCH ?')
        .get('zebra'),
    ).toEqual({ n: 0 });
    expect(db.prepare('SELECT name FROM tags').all()).toEqual([{ name: 'external' }]);
    db.close();
  });

  it('reconciles renamed subtrees, including empty folders, while preserving document ids', async () => {
    const { content, db, registry } = await setup();
    await fs.mkdir(path.join(content, 'Old/Empty'), { recursive: true });
    await fs.mkdir(path.join(content, 'Unrelated'));
    await fs.writeFile(path.join(content, 'Old/A.md'), source('moved'));
    await registry.refresh();
    await fs.rename(path.join(content, 'Old'), path.join(content, 'New'));
    vi.clearAllMocks();

    const changes = await registry.refresh(['Old', 'New', 'New/A.md']);

    expect(changes.documents).toEqual([
      { kind: 'changed', id: ID, path: 'New/A.md', previousPath: 'Old/A.md' },
    ]);
    expect(registry.folders()).toEqual(['New', 'New/Empty', 'Unrelated']);
    expect(fs.readdir).toHaveBeenCalledTimes(2);
    expect(db.prepare('SELECT path FROM documents').all()).toEqual([{ path: 'New/A.md' }]);
    db.close();
  });

  it('resolves duplicate ownership globally when the first copy is added or removed', async () => {
    const { content, db, registry } = await setup();
    await fs.writeFile(path.join(content, 'B.md'), source('second'));
    await registry.refresh();
    await fs.writeFile(path.join(content, 'A.md'), source('first'));
    await registry.refresh(['A.md']);
    expect(registry.get(ID)?.path).toBe('A.md');
    expect(registry.get(provisionalId('B.md'))).toBeDefined();
    expect(registry.issues()).toMatchObject([{ code: 'DUPLICATE_ID', path: 'B.md' }]);
    await fs.rm(path.join(content, 'A.md'));
    await registry.refresh(['A.md']);
    expect(registry.get(ID)?.path).toBe('B.md');
    expect(registry.issues()).toEqual([]);
    expect(db.prepare('SELECT id, path FROM documents').all()).toEqual([{ id: ID, path: 'B.md' }]);
    db.close();
  });

  it('retains unrelated parse issues and clears them only after the affected file is fixed', async () => {
    const { content, db, registry } = await setup();
    await fs.writeFile(path.join(content, 'Broken.md'), '---\ntitle: [broken\n---\nBody');
    await registry.refresh();
    await fs.writeFile(path.join(content, 'A.md'), source('new'));
    await registry.refresh(['A.md']);
    expect(registry.issues()).toMatchObject([{ code: 'FRONTMATTER_INVALID', path: 'Broken.md' }]);
    await fs.writeFile(path.join(content, 'Broken.md'), '# Fixed');
    await registry.refresh(['Broken.md']);
    expect(registry.issues()).toEqual([]);
    db.close();
  });

  it.each(['file', 'directory'])(
    'does not follow an unrelated cached %s symlink when re-keying duplicates',
    async (kind) => {
      const { content, db, registry } = await setup();
      const outside = await makeTempDir();
      await fs.mkdir(path.join(content, 'B'));
      await fs.writeFile(path.join(content, 'B/Doc.md'), source('original'));
      await registry.refresh();
      await fs.writeFile(path.join(outside, 'Doc.md'), source('outsideSecret'));
      if (kind === 'file') {
        await fs.rm(path.join(content, 'B/Doc.md'));
        await fs.symlink(path.join(outside, 'Doc.md'), path.join(content, 'B/Doc.md'));
      } else {
        await fs.rm(path.join(content, 'B'), { recursive: true });
        await fs.symlink(outside, path.join(content, 'B'));
      }
      // The A event arrives before the event for the replaced B path.
      await fs.writeFile(path.join(content, 'A.md'), source('first'));
      vi.clearAllMocks();
      await registry.refresh(['A.md']);
      expect(fs.readFile).toHaveBeenCalledExactlyOnceWith(path.join(content, 'A.md'));
      expect(db.prepare('SELECT path FROM documents').all()).toEqual([{ path: 'A.md' }]);
      expect(
        db
          .prepare('SELECT count(*) AS n FROM documents_fts WHERE documents_fts MATCH ?')
          .get('outsideSecret'),
      ).toEqual({ n: 0 });
      await registry.refresh(['B/Doc.md']);
      expect(registry.list()).toMatchObject([{ path: 'A.md' }]);
      db.close();
    },
  );

  it('invalidates a replaced ancestor without following symlinks or indexing hidden paths', async () => {
    const { content, db, registry } = await setup();
    const outside = await makeTempDir();
    await fs.writeFile(path.join(outside, 'A.md'), source('outside'));
    await fs.mkdir(path.join(content, 'Folder'));
    await fs.writeFile(path.join(content, 'Folder/A.md'), source('inside'));
    await registry.refresh();
    await fs.rm(path.join(content, 'Folder'), { recursive: true });
    await fs.symlink(outside, path.join(content, 'Folder'));
    await fs.mkdir(path.join(content, '_templates'));
    await fs.writeFile(path.join(content, '_templates/A.md'), source('hidden'));
    vi.clearAllMocks();
    await registry.refresh(['Folder/A.md', '_templates/A.md']);
    expect(registry.list()).toEqual([]);
    expect(registry.folders()).toEqual([]);
    expect(fs.readFile).not.toHaveBeenCalled();
    expect(fs.readdir).not.toHaveBeenCalled();
    await expect(registry.refresh(['../A.md'])).rejects.toMatchObject({ code: 'UNSAFE_PATH' });
    db.close();
  });
});
