import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { DocumentDto, TagsResponse } from '@leandocs/shared';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../test/authenticated-app.js';
import { loadConfig } from '../config/config.js';
import { makeTempDir } from '../test/temp-dir.js';

/** P10-03 / P10-04: properties editing (UI_SPEC §115) and the tag list. */

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

const SERVER = [
  '---',
  'id: buz',
  'title: BUZHULK',
  '# keep this comment',
  'owner: ops',
  'tags: [server, docker]',
  'created: 2026-01-01T00:00:00Z',
  'updated: 2026-01-01T00:00:00Z',
  '---',
  'Body stays.',
  '',
].join('\n');

async function start(files: Record<string, string>) {
  const dataDir = await makeTempDir();
  const content = path.join(dataDir, 'content');
  for (const [relative, text] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(content, relative)), { recursive: true });
    await writeFile(path.join(content, relative), text);
  }
  app = await buildApp(loadConfig({ LOG_LEVEL: 'silent', DATA_DIR: dataDir }));
  const read = (file: string) => readFile(path.join(content, file), 'utf8');
  const doc = async (id: string) =>
    (await app!.inject({ method: 'GET', url: `/api/v1/documents/${id}` })).json<DocumentDto>();
  const update = async (id: string, payload: object) =>
    app!.inject({
      method: 'POST',
      url: `/api/v1/documents/${id}/properties`,
      payload: { expectedRevision: (await doc(id)).revision, ...payload },
    });
  return { app, read, update };
}

describe('POST /documents/:id/properties', () => {
  it('changes only the given fields and keeps everything else', async () => {
    const { read, update } = await start({ 'BUZHULK.md': SERVER });
    const res = await update('buz', {
      description: 'Main Incus host',
      tags: ['server', '#incus', 'Server', ' '],
      aliases: ['hulk'],
    });
    expect(res.statusCode, res.body).toBe(200);
    const file = await read('BUZHULK.md');
    expect(file).toContain('# keep this comment\nowner: ops\n');
    expect(file).toContain('tags:\n  - server\n  - incus\n');
    expect(file).toContain('description: Main Incus host');
    expect(file).toContain('aliases:\n  - hulk');
    expect(file).not.toContain('updated: 2026-01-01T00:00:00Z');
    expect(file).toContain('created: 2026-01-01T00:00:00Z');
    expect(file.endsWith('---\nBody stays.\n')).toBe(true);
    expect(res.json<DocumentDto>().frontmatter).toMatchObject({ aliases: ['hulk'] });
  });

  it('removes empty description, tags and aliases', async () => {
    const { read, update } = await start({ 'BUZHULK.md': SERVER });
    await update('buz', { description: 'x', aliases: ['a'] });
    const res = await update('buz', { description: '  ', tags: [], aliases: [] });
    expect(res.statusCode).toBe(200);
    const file = await read('BUZHULK.md');
    expect(file).not.toMatch(/^(description|tags|aliases):/m);
    expect(file).toContain('owner: ops');
  });

  it('rejects stale revisions, empty titles and invalid headers', async () => {
    const { app: api, update } = await start({
      'BUZHULK.md': SERVER,
      'Broken.md': '---\nid: broken\ntitle: [\n---\nx\n',
    });
    const stale = await api.inject({
      method: 'POST',
      url: '/api/v1/documents/buz/properties',
      payload: { expectedRevision: 'sha256:old', tags: ['x'] },
    });
    expect(stale.statusCode).toBe(409);
    expect((await update('buz', { title: '  ' })).statusCode).toBe(400);
    const docs = (await api.inject({ method: 'GET', url: '/api/v1/tree' })).json<{
      root: { children: { id: string; name: string }[] };
    }>();
    const broken = docs.root.children.find((child) => child.name === 'Broken.md')!;
    expect((await update(broken.id, { tags: ['x'] })).statusCode).toBe(422);
  });

  it('a new title updates wiki links that used the old one', async () => {
    const { read, update } = await start({
      'Servers/hulk-01.md': SERVER,
      'Notes.md': '---\nid: notes\ntitle: Notes\n---\nSee [[BUZHULK#Hardware]].\n',
    });
    expect((await update('buz', { title: 'BUZHULK v2' })).statusCode).toBe(200);
    expect(await read('Notes.md')).toContain('See [[BUZHULK v2#Hardware]].');
  });

  it('documents without front matter get one', async () => {
    const { read, update, app: api } = await start({ 'Plain.md': '# Plain\n\ntext\n' });
    const tree = (await api.inject({ method: 'GET', url: '/api/v1/tree' })).json<{
      root: { children: { id: string }[] };
    }>();
    const id = tree.root.children[0]!.id;
    expect((await update(id, { tags: ['misc'] })).statusCode).toBe(200);
    expect(await read('Plain.md')).toMatch(/tags:\n {2}- misc\n---\n\n?# Plain/);
  });
});

describe('GET /tags', () => {
  it('lists tags with counts, by name', async () => {
    const { app: api } = await start({
      'A.md': '---\nid: a\ntags: [docker, Server]\n---\n',
      'B.md': '---\nid: b\ntags: [docker]\n---\n',
    });
    const res = await api.inject({ method: 'GET', url: '/api/v1/tags' });
    expect(res.json<TagsResponse>().items).toEqual([
      { name: 'docker', count: 2 },
      { name: 'Server', count: 1 },
    ]);
  });
});
