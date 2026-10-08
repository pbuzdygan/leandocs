import { mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../test/authenticated-app.js';
import { loadConfig } from '../config/config.js';
import { parseFile } from '../documents/frontmatter.js';
import { makeTempDir } from '../test/temp-dir.js';

const ID_A = '77ce39fd-03cd-4d78-9e8f-87828449e0aa';
const apps: FastifyInstance[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

async function revisionOf(app: FastifyInstance, id: string): Promise<string> {
  return (await app.inject({ method: 'GET', url: `/api/v1/documents/${id}` })).json().revision;
}

async function setup(files: Record<string, string> = {}) {
  const dataDir = await makeTempDir();
  const content = path.join(dataDir, 'content');
  for (const [relative, source] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(content, relative)), { recursive: true });
    await writeFile(path.join(content, relative), source);
  }
  const app = await buildApp(loadConfig({ LOG_LEVEL: 'silent', DATA_DIR: dataDir }));
  apps.push(app);
  return { app, content };
}

describe('GET /api/v1/tree', () => {
  it('returns an empty root for empty content', async () => {
    const { app } = await setup();
    const res = await app.inject({ method: 'GET', url: '/api/v1/tree' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ root: { type: 'folder', name: '', path: '', children: [] } });
  });

  it('reflects documents created outside the app (acceptance P1-11)', async () => {
    const { app, content } = await setup();
    await writeFile(path.join(content, 'Test.md'), '# Test\n\nWritten by hand.\n');
    const tree = (await app.inject({ method: 'GET', url: '/api/v1/tree' })).json();
    expect(tree.root.children).toMatchObject([
      { type: 'document', name: 'Test.md', title: 'Test' },
    ]);

    const doc = (
      await app.inject({ method: 'GET', url: `/api/v1/documents/${tree.root.children[0].id}` })
    ).json();
    expect(doc.content).toContain('Written by hand.');
    expect(await readFile(path.join(content, 'Test.md'), 'utf8')).toContain('Written by hand.');
  });
});

describe('GET /api/v1/documents/:id', () => {
  it('returns the document DTO', async () => {
    const source = `---\nid: ${ID_A}\ntitle: BUZHULK\ncreated: 2026-10-01T00:00:00Z\nupdated: 2026-10-02T00:00:00Z\ntags:\n  - server\n---\n\n# BUZHULK\n`;
    const { app } = await setup({ 'Infrastructure/BUZHULK.md': source });
    const res = await app.inject({ method: 'GET', url: `/api/v1/documents/${ID_A}` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      id: ID_A,
      title: 'BUZHULK',
      path: 'Infrastructure/BUZHULK.md',
      content: '# BUZHULK\n',
      frontmatter: {
        id: ID_A,
        title: 'BUZHULK',
        created: '2026-10-01T00:00:00Z',
        updated: '2026-10-02T00:00:00Z',
        tags: ['server'],
      },
      revision: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
      created: '2026-10-01T00:00:00Z',
      updated: '2026-10-02T00:00:00Z',
    });
  });

  it('serves documents with invalid front matter and reports the problem', async () => {
    const { app } = await setup({ 'Broken.md': '---\na: [\n---\nBody\n' });
    const tree = (await app.inject({ method: 'GET', url: '/api/v1/tree' })).json();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/documents/${tree.root.children[0].id}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ content: 'Body\n', frontmatterError: expect.any(String) });
  });

  it('returns 404 for unknown ids and documents deleted outside the app', async () => {
    const { app, content } = await setup({ 'Doc.md': `---\nid: ${ID_A}\n---\n` });
    const missing = await app.inject({ method: 'GET', url: '/api/v1/documents/does-not-exist' });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toEqual({
      error: { code: 'DOCUMENT_NOT_FOUND', message: 'Document not found' },
    });

    await (await import('node:fs/promises')).rm(path.join(content, 'Doc.md'));
    expect((await app.inject({ method: 'GET', url: `/api/v1/documents/${ID_A}` })).statusCode).toBe(
      404,
    );
  });
});

describe('POST /api/v1/documents', () => {
  it('creates a Markdown file with front matter', async () => {
    const { app, content } = await setup();
    await mkdir(path.join(content, 'Applications'));
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/documents',
      payload: { name: 'Home Assistant', folder: 'Applications', content: '# Home Assistant\n' },
    });
    expect(res.statusCode).toBe(201);
    const doc = res.json();
    expect(doc).toMatchObject({ title: 'Home Assistant', path: 'Applications/Home Assistant.md' });

    const source = await readFile(path.join(content, 'Applications/Home Assistant.md'), 'utf8');
    const parsed = parseFile(source);
    expect(parsed.data).toMatchObject({ id: doc.id, title: 'Home Assistant' });
    expect(parsed.data.created).toBe(parsed.data.updated);
    expect(parsed.body).toBe('# Home Assistant\n');
    expect(source).toContain('---\n\n# Home Assistant\n');
    expect(await readdir(path.join(content, 'Applications'))).toEqual(['Home Assistant.md']);
  });

  it('sanitises the file name and keeps the title', async () => {
    const { app } = await setup();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/documents',
      payload: { name: 'Backup: Restore/Procedure', title: 'Backup: Restore/Procedure' },
    });
    expect(res.json()).toMatchObject({
      path: 'Backup- Restore-Procedure.md',
      title: 'Backup: Restore/Procedure',
    });
  });

  it('never overwrites an existing document', async () => {
    const { app, content } = await setup({ 'BUZHULK.md': 'original' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/documents',
      payload: { name: 'BUZHULK' },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('DOCUMENT_EXISTS');
    expect(await readFile(path.join(content, 'BUZHULK.md'), 'utf8')).toContain('original');
  });

  it.each([
    [{ name: 'X', folder: '../outside' }, 400, 'UNSAFE_PATH'],
    [{ name: 'X', folder: '/etc' }, 400, 'UNSAFE_PATH'],
    [{ name: 'X', folder: '_trash' }, 400, 'INVALID_FOLDER'],
    [{ name: 'X', folder: 'A/.git' }, 400, 'INVALID_FOLDER'],
    [{ name: 'X', folder: 'Missing' }, 404, 'FOLDER_NOT_FOUND'],
    [{ name: 'CON' }, 400, 'INVALID_NAME'],
    [{ name: '...' }, 400, 'INVALID_NAME'],
    [{ name: '' }, 400, 'VALIDATION_ERROR'],
    [{ folder: 'x' }, 400, 'VALIDATION_ERROR'],
    [{ name: 'X', unexpected: true }, 400, 'VALIDATION_ERROR'],
  ])('rejects %j with %i %s', async (payload, status, code) => {
    const { app } = await setup();
    const res = await app.inject({ method: 'POST', url: '/api/v1/documents', payload });
    expect(res.statusCode).toBe(status);
    expect(res.json().error.code).toBe(code);
  });
});

describe('PUT /api/v1/documents/:id', () => {
  it('replaces the body, refreshes `updated` and keeps other front matter untouched', async () => {
    const original = `---\nid: ${ID_A}\ntitle: BUZHULK # main host\nupdated: 2020-01-01T00:00:00Z\ncustom:\n  nested: true\n---\nOld body\n`;
    const { app, content } = await setup({ 'BUZHULK.md': original });
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/documents/${ID_A}`,
      payload: { content: 'New body\n', expectedRevision: await revisionOf(app, ID_A) },
    });
    expect(res.statusCode).toBe(200);
    const doc = res.json();
    expect(doc.content).toBe('New body\n');
    expect(doc.updated).not.toBe('2020-01-01T00:00:00Z');

    const written = await readFile(path.join(content, 'BUZHULK.md'), 'utf8');
    expect(written).toBe(
      `---\nid: ${ID_A}\ntitle: BUZHULK # main host\nupdated: ${doc.updated}\ncustom:\n  nested: true\n---\nNew body\n`,
    );
  });

  it('keeps the blank line between front matter and body', async () => {
    const { app, content } = await setup({ 'Doc.md': `---\nid: ${ID_A}\n---\n\nOld\n` });
    const doc = (await app.inject({ method: 'GET', url: `/api/v1/documents/${ID_A}` })).json();
    expect(doc.content).toBe('Old\n');
    await app.inject({
      method: 'PUT',
      url: `/api/v1/documents/${ID_A}`,
      payload: { content: 'New\n', expectedRevision: await revisionOf(app, ID_A) },
    });
    expect(await readFile(path.join(content, 'Doc.md'), 'utf8')).toMatch(/\n---\n\nNew\n$/);
  });

  it('keeps invalid front matter verbatim', async () => {
    const { app, content } = await setup({ 'Broken.md': '---\na: [\n---\nOld\n' });
    const tree = (await app.inject({ method: 'GET', url: '/api/v1/tree' })).json();
    const id = tree.root.children[0].id;
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/documents/${id}`,
      payload: { content: 'New\n', expectedRevision: await revisionOf(app, id) },
    });
    expect(res.statusCode).toBe(200);
    expect(await readFile(path.join(content, 'Broken.md'), 'utf8')).toBe('---\na: [\n---\nNew\n');
  });

  it('returns 404 for unknown documents and 400 for invalid bodies', async () => {
    const { app } = await setup({ 'Doc.md': `---\nid: ${ID_A}\n---\n` });
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: '/api/v1/documents/nope',
          payload: { content: '', expectedRevision: 'x' },
        })
      ).statusCode,
    ).toBe(404);
    const invalid = await app.inject({
      method: 'PUT',
      url: `/api/v1/documents/${ID_A}`,
      payload: {},
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json().error.code).toBe('VALIDATION_ERROR');
  });
});

describe('cached document path security', () => {
  it.each(['document', 'raw', 'save'])(
    'rejects a file replaced by an outside symlink during %s access',
    async (operation) => {
      const { app, content } = await setup({
        'Guide.md': `---\nid: ${ID_A}\n---\noriginal document\n`,
      });
      const revision = await revisionOf(app, ID_A);
      const outside = await makeTempDir();
      const secret = path.join(outside, 'Private.md');
      await writeFile(secret, 'private outside content');
      await rm(path.join(content, 'Guide.md'));
      await symlink(secret, path.join(content, 'Guide.md'));
      const response = await app.inject({
        method: operation === 'save' ? 'PUT' : 'GET',
        url: `/api/v1/documents/${ID_A}${operation === 'raw' ? '/raw' : ''}`,
        ...(operation === 'save'
          ? { payload: { content: 'replacement', expectedRevision: revision } }
          : {}),
      });
      expect(response.statusCode).toBe(404);
      expect(response.body).not.toContain('private outside content');
      expect(await readFile(secret, 'utf8')).toBe('private outside content');
    },
  );
});
