import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { DocumentDto, TreeFolderNode, TreeNode } from '@leandocs/shared';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../test/authenticated-app.js';
import { loadConfig } from '../config/config.js';
import { parseFile } from '../documents/frontmatter.js';
import { scanContent } from '../documents/scanner.js';
import { makeTempDir } from '../test/temp-dir.js';

/**
 * Integration tests for the document lifecycle (PROJECT_SPEC §88, Phase 2).
 * After every mutation `expectInSync` verifies that the API tree equals what is on disk.
 */

const apps: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

async function setup(files: Record<string, string> = {}) {
  const dataDir = await makeTempDir();
  const content = path.join(dataDir, 'content');
  for (const [relative, source] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(content, relative)), { recursive: true });
    await writeFile(path.join(content, relative), source);
  }
  const app = await buildApp(loadConfig({ LOG_LEVEL: 'silent', DATA_DIR: dataDir }));
  apps.push(app);

  const call = async (options: InjectOptions) => {
    const res = await app.inject(options);
    return { status: res.statusCode, body: res.body ? res.json() : undefined };
  };
  const api = {
    get: (url: string) => call({ method: 'GET', url: `/api/v1${url}` }),
    post: (url: string, payload?: object) =>
      call({ method: 'POST', url: `/api/v1${url}`, ...(payload ? { payload } : {}) }),
    put: (url: string, payload: object) => call({ method: 'PUT', url: `/api/v1${url}`, payload }),
    delete: (url: string) => call({ method: 'DELETE', url: `/api/v1${url}` }),
  };
  const create = async (name: string, folder = '', body = `# ${name}\n`): Promise<DocumentDto> => {
    const res = await api.post('/documents', { name, folder, content: body });
    expect(res.status).toBe(201);
    return res.body;
  };
  const file = (relative: string) => readFile(path.join(content, relative), 'utf8');
  const exists = (relative: string) =>
    readFile(path.join(content, relative)).then(
      () => true,
      () =>
        readdir(path.join(content, relative)).then(
          () => true,
          () => false,
        ),
    );

  async function expectInSync(): Promise<void> {
    const tree: TreeFolderNode = (await api.get('/tree')).body.root;
    const fromApi = { folders: [] as string[], documents: [] as string[] };
    const walk = (node: TreeNode) => {
      if (node.type === 'document') fromApi.documents.push(node.path);
      else {
        if (node.path !== '') fromApi.folders.push(node.path);
        node.children.forEach(walk);
      }
    };
    walk(tree);
    const disk = await scanContent(content);
    expect(fromApi.folders.sort()).toEqual(disk.folders.sort());
    expect(fromApi.documents.sort()).toEqual(disk.files.map((f) => f.path).sort());
  }

  return { app, api, content, create, file, exists, expectInSync };
}

describe('save with revision check (P2-02)', () => {
  it('saves when the revision matches and returns the new revision', async () => {
    const { api, create } = await setup();
    const doc = await create('BUZHULK');
    const res = await api.put(`/documents/${doc.id}`, {
      content: 'v2\n',
      expectedRevision: doc.revision,
    });
    expect(res.status).toBe(200);
    expect(res.body.revision).not.toBe(doc.revision);
  });

  it('rejects a save when the file changed on disk and keeps the external change', async () => {
    const { api, create, content, file } = await setup();
    const doc = await create('BUZHULK');
    const external = (await file('BUZHULK.md')).replace('# BUZHULK', '# Edited in VS Code');
    await writeFile(path.join(content, 'BUZHULK.md'), external);

    const res = await api.put(`/documents/${doc.id}`, {
      content: 'my editor version\n',
      expectedRevision: doc.revision,
    });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({
      code: 'DOCUMENT_CONFLICT',
      details: { currentRevision: expect.stringMatching(/^sha256:/) },
    });
    expect(await file('BUZHULK.md')).toBe(external);
  });

  it('a stale editor cannot overwrite a newer save', async () => {
    const { api, create } = await setup();
    const doc = await create('Doc');
    const first = await api.put(`/documents/${doc.id}`, {
      content: 'A\n',
      expectedRevision: doc.revision,
    });
    expect(first.status).toBe(200);
    const second = await api.put(`/documents/${doc.id}`, {
      content: 'B\n',
      expectedRevision: doc.revision,
    });
    expect(second.status).toBe(409);
  });

  it('requires expectedRevision', async () => {
    const { api, create } = await setup();
    const doc = await create('Doc');
    const res = await api.put(`/documents/${doc.id}`, { content: 'x' });
    expect(res.status).toBe(400);
  });
});

describe('rename (P2-03)', () => {
  it('renames the file and its attachments folder, keeping the id', async () => {
    const { api, create, content, exists, expectInSync } = await setup();
    await mkdir(path.join(content, 'Servers'));
    const doc = await create('BUZHULK', 'Servers');
    await mkdir(path.join(content, 'Servers/BUZHULK.assets'));
    await writeFile(path.join(content, 'Servers/BUZHULK.assets/rack.png'), 'png');

    const res = await api.post(`/documents/${doc.id}/rename`, { name: 'BUZHULK old' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: doc.id,
      path: 'Servers/BUZHULK old.md',
      title: 'BUZHULK',
    });
    expect(await exists('Servers/BUZHULK old.assets/rack.png')).toBe(true);
    expect(await exists('Servers/BUZHULK.md')).toBe(false);
    expect(await exists('Servers/BUZHULK.assets')).toBe(false);
    await expectInSync();
  });

  it('can also change the title with a minimal front matter change', async () => {
    const { api, create, file } = await setup();
    const doc = await create('Old');
    const res = await api.post(`/documents/${doc.id}/rename`, { name: 'New', title: 'New: title' });
    expect(res.body).toMatchObject({ path: 'New.md', title: 'New: title' });
    const parsed = parseFile(await file('New.md'));
    expect(parsed.data).toMatchObject({ id: doc.id, title: 'New: title' });
    expect(parsed.body).toBe('# Old\n');
  });

  it('never overwrites an existing document or attachments folder', async () => {
    const { api, create, content, file } = await setup();
    const a = await create('A');
    await create('B');
    const res = await api.post(`/documents/${a.id}/rename`, { name: 'B' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DOCUMENT_EXISTS');
    expect(await file('B.md')).toContain('# B');

    await mkdir(path.join(content, 'A.assets'));
    await mkdir(path.join(content, 'C.assets'));
    const assetsClash = await api.post(`/documents/${a.id}/rename`, { name: 'C' });
    expect(assetsClash.status).toBe(409);
    expect(await file('A.md')).toContain('# A');
  });

  it('handles a case-only rename', async () => {
    const { api, create, exists } = await setup();
    const doc = await create('buzhulk');
    const res = await api.post(`/documents/${doc.id}/rename`, { name: 'BUZHULK' });
    expect(res.status).toBe(200);
    expect(res.body.path).toBe('BUZHULK.md');
    expect(await exists('BUZHULK.md')).toBe(true);
  });

  it('rejects invalid names', async () => {
    const { api, create } = await setup();
    const doc = await create('Doc');
    expect((await api.post(`/documents/${doc.id}/rename`, { name: 'CON' })).body.error.code).toBe(
      'INVALID_NAME',
    );
  });
});

describe('move (P2-04)', () => {
  it('moves the document and attachments into another folder', async () => {
    const { api, create, content, exists, expectInSync } = await setup();
    await mkdir(path.join(content, 'Network'));
    await mkdir(path.join(content, 'Infrastructure'));
    const doc = await create('UniFi', 'Network');
    await mkdir(path.join(content, 'Network/UniFi.assets'));

    const res = await api.post(`/documents/${doc.id}/move`, { folder: 'Infrastructure' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: doc.id, path: 'Infrastructure/UniFi.md' });
    expect(await exists('Infrastructure/UniFi.assets')).toBe(true);
    expect(await exists('Network/UniFi.md')).toBe(false);
    await expectInSync();
  });

  it('creates missing target folders only when asked', async () => {
    const { api, create, expectInSync } = await setup();
    const doc = await create('UniFi');
    const missing = await api.post(`/documents/${doc.id}/move`, {
      folder: 'Infrastructure/Network',
    });
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('FOLDER_NOT_FOUND');

    const res = await api.post(`/documents/${doc.id}/move`, {
      folder: 'Infrastructure/Network',
      createFolders: true,
    });
    expect(res.body.path).toBe('Infrastructure/Network/UniFi.md');
    await expectInSync();
  });

  it.each([
    [{ folder: '../outside' }, 'UNSAFE_PATH'],
    [{ folder: '_trash' }, 'INVALID_FOLDER'],
    [{ folder: 'X/Doc.assets', createFolders: true }, 'INVALID_FOLDER'],
    [{ folder: 'Bad:Name', createFolders: true }, 'INVALID_NAME'],
  ])('rejects %j', async (payload, code) => {
    const { api, create } = await setup();
    const doc = await create('Doc');
    expect((await api.post(`/documents/${doc.id}/move`, payload)).body.error.code).toBe(code);
  });

  it('never overwrites a document with the same name in the target folder', async () => {
    const { api, create, content, file } = await setup();
    await mkdir(path.join(content, 'Target'));
    const doc = await create('Same');
    await create('Same', 'Target', 'target version\n');
    const res = await api.post(`/documents/${doc.id}/move`, { folder: 'Target' });
    expect(res.status).toBe(409);
    expect(await file('Target/Same.md')).toContain('target version');
    expect(await file('Same.md')).toContain('# Same');
  });
});

describe('trash, restore and permanent delete (P2-05, P2-06)', () => {
  it('moves a document with its attachments to the trash and restores it', async () => {
    const { api, create, content, exists, expectInSync } = await setup();
    await mkdir(path.join(content, 'Servers'));
    const doc = await create('BUZHULK', 'Servers');
    await mkdir(path.join(content, 'Servers/BUZHULK.assets'));
    await writeFile(path.join(content, 'Servers/BUZHULK.assets/a.png'), 'png');

    const trashed = await api.delete(`/documents/${doc.id}`);
    expect(trashed.status).toBe(200);
    expect(trashed.body).toMatchObject({
      kind: 'document',
      name: 'BUZHULK.md',
      originalPath: 'Servers/BUZHULK.md',
      documentId: doc.id,
      title: 'BUZHULK',
    });
    expect(await exists('Servers/BUZHULK.md')).toBe(false);
    expect(await exists(`_trash/${trashed.body.trashId}/BUZHULK.md`)).toBe(true);
    expect(await exists(`_trash/${trashed.body.trashId}/BUZHULK.assets/a.png`)).toBe(true);
    expect((await api.get(`/documents/${doc.id}`)).status).toBe(404);
    expect((await api.get('/trash')).body.items).toHaveLength(1);
    await expectInSync();

    const restored = await api.post(`/trash/${trashed.body.trashId}/restore`);
    expect(restored.body).toEqual({
      kind: 'document',
      path: 'Servers/BUZHULK.md',
      documentId: doc.id,
    });
    expect(await exists('Servers/BUZHULK.assets/a.png')).toBe(true);
    expect((await api.get(`/documents/${doc.id}`)).status).toBe(200);
    expect((await api.get('/trash')).body.items).toEqual([]);
    await expectInSync();
  });

  it('restores by document id and recreates a deleted parent folder', async () => {
    const { api, create, content, expectInSync } = await setup();
    await mkdir(path.join(content, 'Gone'));
    const doc = await create('Doc', 'Gone');
    await api.delete(`/documents/${doc.id}`);
    await rm(path.join(content, 'Gone'), { recursive: true });

    const res = await api.post(`/documents/${doc.id}/restore`);
    expect(res.status).toBe(200);
    expect(res.body.path).toBe('Gone/Doc.md');
    await expectInSync();
  });

  it('refuses to restore over a document created at the same place', async () => {
    const { api, create, file } = await setup();
    const doc = await create('Doc');
    const trashed = await api.delete(`/documents/${doc.id}`);
    await create('Doc', '', 'newer document\n');
    const res = await api.post(`/trash/${trashed.body.trashId}/restore`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('RESTORE_CONFLICT');
    expect(await file('Doc.md')).toContain('newer document');
    expect((await api.get('/trash')).body.items).toHaveLength(1);
  });

  it('deletes permanently only from the trash, and empties the trash', async () => {
    const { api, create, exists } = await setup();
    const a = await create('A');
    const b = await create('B');
    const trashedA = await api.delete(`/documents/${a.id}`);
    await api.delete(`/documents/${b.id}`);

    expect((await api.delete(`/trash/${trashedA.body.trashId}`)).status).toBe(204);
    expect(await exists(`_trash/${trashedA.body.trashId}`)).toBe(false);
    expect((await api.get('/trash')).body.items).toHaveLength(1);

    expect((await api.delete('/trash')).body).toEqual({ deleted: 1 });
    expect((await api.get('/trash')).body.items).toEqual([]);
  });

  it('returns 404 for unknown or malformed trash ids', async () => {
    const { api } = await setup();
    for (const id of ['20261002T000000Z-deadbeef', '..', 'nope']) {
      const res = await api.post(`/trash/${encodeURIComponent(id)}/restore`);
      expect(res.status).toBe(404);
    }
    expect((await api.post('/documents/unknown/restore')).status).toBe(404);
  });

  it('ignores trash entries with tampered metadata', async () => {
    const { api, create, content } = await setup();
    const doc = await create('Doc');
    const trashed = await api.delete(`/documents/${doc.id}`);
    const metaFile = path.join(content, '_trash', trashed.body.trashId, '.leandocs-trash.json');
    const meta = JSON.parse(await readFile(metaFile, 'utf8'));
    await writeFile(metaFile, JSON.stringify({ ...meta, name: '..' }));
    expect((await api.get('/trash')).body.items).toEqual([]);
    expect((await api.post(`/trash/${trashed.body.trashId}/restore`)).status).toBe(404);

    await writeFile(metaFile, JSON.stringify({ ...meta, originalPath: '_templates/Doc.md' }));
    expect((await api.post(`/trash/${trashed.body.trashId}/restore`)).body.error.code).toBe(
      'INVALID_FOLDER',
    );
  });
});

describe('folders (P2-07)', () => {
  it('creates, renames and moves folders; documents keep their ids', async () => {
    const { api, create, expectInSync } = await setup();
    expect((await api.post('/folders', { name: 'Network' })).body).toEqual({
      path: 'Network',
      name: 'Network',
    });
    expect((await api.post('/folders', { parent: 'Network', name: 'VLANs' })).status).toBe(201);
    const doc = await create('VLAN 10', 'Network/VLANs');

    const renamed = await api.post('/folders/rename', { path: 'Network', name: 'Networking' });
    expect(renamed.body).toEqual({ path: 'Networking', name: 'Networking' });
    expect((await api.get(`/documents/${doc.id}`)).body.path).toBe('Networking/VLANs/VLAN 10.md');

    await api.post('/folders', { name: 'Infrastructure' });
    const moved = await api.post('/folders/move', {
      path: 'Networking',
      targetFolder: 'Infrastructure',
    });
    expect(moved.body.path).toBe('Infrastructure/Networking');
    expect((await api.get(`/documents/${doc.id}`)).body.path).toBe(
      'Infrastructure/Networking/VLANs/VLAN 10.md',
    );
    await expectInSync();
  });

  it.each([
    ['/folders', { name: '_system' }, 400, 'INVALID_NAME'],
    ['/folders', { name: 'x.assets' }, 400, 'INVALID_NAME'],
    ['/folders', { parent: 'Missing', name: 'x' }, 404, 'FOLDER_NOT_FOUND'],
    ['/folders', { parent: '../', name: 'x' }, 400, 'UNSAFE_PATH'],
    ['/folders/rename', { path: '', name: 'x' }, 400, 'INVALID_FOLDER'],
    ['/folders/rename', { path: '_trash', name: 'x' }, 400, 'INVALID_FOLDER'],
    ['/folders/move', { path: 'A', targetFolder: 'A/B' }, 400, 'INVALID_MOVE'],
    ['/folders/move', { path: 'A', targetFolder: 'A' }, 400, 'INVALID_MOVE'],
  ])('POST %s %j → %i %s', async (url, payload, status, code) => {
    const { api, content } = await setup();
    await mkdir(path.join(content, 'A/B'), { recursive: true });
    const res = await api.post(url, payload);
    expect(res.status).toBe(status);
    expect(res.body.error.code).toBe(code);
  });

  it('never merges into or overwrites an existing folder', async () => {
    const { api, content } = await setup();
    await mkdir(path.join(content, 'A'));
    await mkdir(path.join(content, 'B'));
    expect((await api.post('/folders', { name: 'A' })).body.error.code).toBe('FOLDER_EXISTS');
    expect((await api.post('/folders/rename', { path: 'A', name: 'B' })).body.error.code).toBe(
      'FOLDER_EXISTS',
    );
  });

  it('removes empty folders directly and trashes folders with content', async () => {
    const { api, create, exists, expectInSync } = await setup();
    await api.post('/folders', { name: 'Empty' });
    await api.post('/folders', { name: 'Full' });
    const doc = await create('Doc', 'Full');

    expect((await api.delete('/folders?path=Empty')).body).toEqual({ trashed: false });
    expect(await exists('Empty')).toBe(false);

    const res = await api.delete('/folders?path=Full');
    expect(res.body).toMatchObject({
      trashed: true,
      trashItem: { kind: 'folder', originalPath: 'Full' },
    });
    expect((await api.get(`/documents/${doc.id}`)).status).toBe(404);
    await expectInSync();

    await api.post(`/trash/${res.body.trashItem.trashId}/restore`);
    expect((await api.get(`/documents/${doc.id}`)).body.path).toBe('Full/Doc.md');
    await expectInSync();
  });
});

describe('index status (P2-11)', () => {
  it('reports counts and scan issues', async () => {
    const id = '77ce39fd-03cd-4d78-9e8f-87828449e0aa';
    const { api } = await setup({
      'A.md': `---\nid: ${id}\n---\n`,
      'B.md': `---\nid: ${id}\n---\n`,
      'Folder/Broken.md': '---\na: [\n---\n',
    });
    const res = await api.get('/index/status');
    expect(res.body).toMatchObject({
      documents: 3,
      folders: 1,
      issues: [
        { code: 'DUPLICATE_ID', path: 'B.md' },
        { code: 'FRONTMATTER_INVALID', path: 'Folder/Broken.md' },
      ],
    });
  });
});

describe('timestamps (P2-08)', () => {
  it('sets created on create and only updated on save', async () => {
    const { api, create, file } = await setup();
    const doc = await create('Doc');
    expect(doc.created).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
    const before = parseFile(await file('Doc.md')).data;
    await new Promise((resolve) => setTimeout(resolve, 1100));
    await api.put(`/documents/${doc.id}`, { content: 'x\n', expectedRevision: doc.revision });
    const after = parseFile(await file('Doc.md')).data;
    expect(after.created).toBe(before.created);
    expect(after.updated).not.toBe(before.updated);
  });
});

describe('recent documents', () => {
  it('lists documents by last modification, newest first', async () => {
    const { api, create } = await setup();
    const a = await create('A');
    await new Promise((resolve) => setTimeout(resolve, 20));
    const b = await create('B');
    const res = await api.get('/documents/recent?limit=5');
    expect(res.body.items.map((item: { id: string }) => item.id)).toEqual([b.id, a.id]);
    expect(res.body.items[0]).toMatchObject({
      title: 'B',
      path: 'B.md',
      modified: expect.any(String),
    });
    expect((await api.get('/documents/recent?limit=0')).status).toBe(400);
  });
});

describe('raw download', () => {
  it('returns the physical file as an attachment', async () => {
    const { app, create, file } = await setup();
    const doc = await create('Zażółć notes');
    const res = await app.inject({ method: 'GET', url: `/api/v1/documents/${doc.id}/raw` });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('text/markdown; charset=utf-8');
    expect(res.headers['content-disposition']).toContain(
      `filename*=UTF-8''${encodeURIComponent('Zażółć notes.md')}`,
    );
    expect(res.body).toBe(await file('Zażółć notes.md'));
  });
});
