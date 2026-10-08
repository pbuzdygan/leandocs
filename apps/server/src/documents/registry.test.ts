import { mkdir, readFile, rm, utimes, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { makeTempDir, silentLogger } from '../test/temp-dir.js';
import { parseFile } from './frontmatter.js';
import { DocumentRegistry, deriveTitle, isValidDocumentId, provisionalId } from './registry.js';

async function put(root: string, relative: string, content: string): Promise<string> {
  const file = path.join(root, relative);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content);
  return file;
}

async function loadRegistry(root: string, assignMissingIds = true): Promise<DocumentRegistry> {
  const registry = new DocumentRegistry(root, { assignMissingIds, logger: silentLogger });
  await registry.refresh();
  return registry;
}

const ID_A = '77ce39fd-03cd-4d78-9e8f-87828449e0aa';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('DocumentRegistry', () => {
  it('handles an empty content directory', async () => {
    const registry = await loadRegistry(await makeTempDir());
    expect(registry.list()).toEqual([]);
    expect(registry.issues()).toEqual([]);
    expect(registry.tree()).toEqual({ type: 'folder', name: '', path: '', children: [] });
  });

  it('indexes documents that already have an id without modifying them', async () => {
    const root = await makeTempDir();
    const source = `---\nid: ${ID_A}\ntitle: BUZHULK\n---\n# BUZHULK\n`;
    const file = await put(root, 'Infrastructure/BUZHULK.md', source);
    const registry = await loadRegistry(root);
    expect(registry.get(ID_A)).toMatchObject({
      id: ID_A,
      idSource: 'frontmatter',
      path: 'Infrastructure/BUZHULK.md',
      title: 'BUZHULK',
    });
    expect(await readFile(file, 'utf8')).toBe(source);
  });

  describe('missing ids (D-10)', () => {
    it('adds only the missing fields to a file without front matter; body stays identical', async () => {
      const root = await makeTempDir();
      const body = '# Test\n\nHello **world**.\n';
      const file = await put(root, 'Test.md', body);
      const registry = await loadRegistry(root);

      const [entry] = registry.list();
      expect(entry?.idSource).toBe('frontmatter');
      expect(entry?.id).toMatch(UUID);
      const written = await readFile(file, 'utf8');
      const parsed = parseFile(written);
      expect(parsed.data).toMatchObject({ id: entry?.id, title: 'Test' });
      expect(parsed.data.created).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
      expect(parsed.data.updated).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
      expect(written.endsWith(body)).toBe(true);
    });

    it('keeps existing front matter lines and only appends what is missing', async () => {
      const root = await makeTempDir();
      const original =
        '---\ntitle: My Title # comment\ncustom: value\ncreated: 2020-01-01\n---\nBody\n';
      const file = await put(root, 'Doc.md', original);
      await loadRegistry(root);
      const written = await readFile(file, 'utf8');
      const lines = written.split('\n');
      expect(lines.slice(0, 4)).toEqual([
        '---',
        'title: My Title # comment',
        'custom: value',
        'created: 2020-01-01',
      ]);
      expect(lines[4]).toMatch(/^id: /);
      expect(lines[5]).toMatch(/^updated: /);
      expect(lines.slice(6)).toEqual(['---', 'Body', '']);
    });

    it('uses provisional ids and leaves files alone when disabled', async () => {
      const root = await makeTempDir();
      const file = await put(root, 'Test.md', '# Test\n');
      const registry = await loadRegistry(root, false);
      expect(registry.list()[0]).toMatchObject({
        id: provisionalId('Test.md'),
        idSource: 'provisional',
      });
      expect(await readFile(file, 'utf8')).toBe('# Test\n');
    });
  });

  it('reports invalid front matter, keeps the file untouched and still lists it', async () => {
    const root = await makeTempDir();
    const source = '---\ntitle: [broken\n---\n# Broken\n';
    const file = await put(root, 'Broken.md', source);
    const registry = await loadRegistry(root);
    expect(registry.list()).toMatchObject([{ idSource: 'provisional', title: 'Broken' }]);
    expect(registry.issues()).toMatchObject([{ code: 'FRONTMATTER_INVALID', path: 'Broken.md' }]);
    expect(await readFile(file, 'utf8')).toBe(source);
  });

  it('accepts unusual Markdown content', async () => {
    const root = await makeTempDir();
    await put(
      root,
      'Weird.md',
      `---\nid: ${ID_A}\n---\n<div>\n\`\`\`unclosed fence\n# not a heading\n`,
    );
    await put(root, 'Empty.md', '');
    const registry = await loadRegistry(root);
    expect(registry.list().map((entry) => entry.path)).toEqual(['Empty.md', 'Weird.md']);
    expect(registry.issues()).toEqual([]);
  });

  it('reports duplicate ids; the first path keeps the id, the copy gets a provisional id', async () => {
    const root = await makeTempDir();
    const source = `---\nid: ${ID_A}\ntitle: BUZHULK\n---\n`;
    await put(root, 'A/BUZHULK.md', source);
    const copy = await put(root, 'B/BUZHULK copy.md', source);
    const registry = await loadRegistry(root);
    expect(registry.get(ID_A)?.path).toBe('A/BUZHULK.md');
    expect(registry.get(provisionalId('B/BUZHULK copy.md'))?.idSource).toBe('provisional');
    expect(registry.issues()).toMatchObject([{ code: 'DUPLICATE_ID', path: 'B/BUZHULK copy.md' }]);
    expect(await readFile(copy, 'utf8')).toBe(source);
  });

  it('reports invalid ids', async () => {
    const root = await makeTempDir();
    await put(root, 'Num.md', '---\nid: 12345\n---\n');
    await put(root, 'Bad.md', '---\nid: "../../etc"\n---\n');
    const registry = await loadRegistry(root);
    expect(registry.issues().map((issue) => issue.code)).toEqual(['INVALID_ID', 'INVALID_ID']);
    expect(registry.list().every((entry) => entry.idSource === 'provisional')).toBe(true);
  });

  it('builds a sorted tree: folders first, natural order', async () => {
    const root = await makeTempDir();
    await put(root, 'Doc 10.md', '# Ten\n');
    await put(root, 'Doc 2.md', '# Two\n');
    await put(root, 'Network/VLAN.md', '# VLAN\n');
    await mkdir(path.join(root, 'Applications'));
    const registry = await loadRegistry(root);
    const tree = registry.tree();
    expect(tree.children.map((node) => node.name)).toEqual([
      'Applications',
      'Network',
      'Doc 2.md',
      'Doc 10.md',
    ]);
    expect(tree.children[1]).toMatchObject({
      type: 'folder',
      path: 'Network',
      children: [{ type: 'document', name: 'VLAN.md', title: 'VLAN', path: 'Network/VLAN.md' }],
    });
  });

  it('picks up external changes on refresh', async () => {
    const root = await makeTempDir();
    const file = await put(root, 'Doc.md', `---\nid: ${ID_A}\ntitle: Old\n---\n`);
    const registry = await loadRegistry(root);
    await writeFile(file, `---\nid: ${ID_A}\ntitle: New\n---\n`);
    const future = new Date(Date.now() + 5000);
    await utimes(file, future, future);
    await put(root, 'Added.md', '# Added\n');
    await registry.refresh();
    expect(registry.get(ID_A)?.title).toBe('New');
    expect(registry.list()).toHaveLength(2);
  });
});

describe('helpers', () => {
  it('derives titles', () => {
    expect(deriveTitle({ title: ' Front ' }, '# H1', 'file.md')).toBe('Front');
    expect(deriveTitle({}, 'Intro\n# Heading One #\n', 'file.md')).toBe('Heading One');
    expect(deriveTitle({}, 'no heading', 'Home Assistant.md')).toBe('Home Assistant');
  });

  it('validates ids', () => {
    expect(isValidDocumentId(ID_A)).toBe(true);
    expect(isValidDocumentId('p-abc')).toBe(true);
    expect(isValidDocumentId('../x')).toBe(false);
    expect(isValidDocumentId(1)).toBe(false);
    expect(isValidDocumentId('')).toBe(false);
  });
});

describe('DocumentRegistry change reporting (P12-01)', () => {
  const ID_B = '0b8a1f43-1f2e-4e4a-9a51-2f1f9f0a3c11';

  it('reports added, changed, moved and removed documents and folders', async () => {
    const root = await makeTempDir();
    await put(root, 'A.md', `---\nid: ${ID_A}\n---\n# A\n`);
    await put(root, 'Old/B.md', `---\nid: ${ID_B}\n---\n# B\n`);
    const registry = await loadRegistry(root);
    expect(await registry.refresh()).toEqual({ documents: [], folders: [] });

    await put(root, 'A.md', `---\nid: ${ID_A}\n---\n# A, edited\n`);
    await put(root, 'New/B.md', `---\nid: ${ID_B}\n---\n# B\n`);
    await rm(path.join(root, 'Old'), { recursive: true });
    await put(root, 'C.md', '# C\n');

    const changes = await registry.refresh();
    const created = registry.findByPath('C.md')!;
    expect(changes.documents).toEqual([
      { kind: 'changed', id: ID_A, path: 'A.md' },
      { kind: 'added', id: created.id, path: 'C.md' },
      { kind: 'changed', id: ID_B, path: 'New/B.md', previousPath: 'Old/B.md' },
    ]);
    expect(changes.folders).toEqual([
      { kind: 'added', path: 'New' },
      { kind: 'removed', path: 'Old' },
    ]);

    await rm(path.join(root, 'A.md'));
    expect((await registry.refresh()).documents).toEqual([
      { kind: 'removed', id: ID_A, path: 'A.md' },
    ]);
  });
});
