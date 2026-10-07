import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { MAX_IMPORT_DOCUMENT_BYTES, type ImportReport } from '@leandocs/shared';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../test/authenticated-app.js';
import { loadConfig } from '../config/config.js';
import { makeTempDir } from '../test/temp-dir.js';

const apps: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

type Files = Record<string, string | Buffer>;

async function setup() {
  const root = await makeTempDir();
  const content = path.join(root, 'content');
  const app = await buildApp(loadConfig({ DATA_DIR: root, LOG_LEVEL: 'silent' }));
  apps.push(app);
  const upload = (files: Files, query = '', headers: Record<string, string> = {}) =>
    app.inject({
      method: 'POST',
      url: `/api/v1/import${query}`,
      headers: { 'content-type': 'multipart/form-data; boundary=leandocs-import', ...headers },
      payload: multipart(files),
    });
  const preview = async (files: Files, destination = '') => {
    const response = await upload(
      files,
      `?dryRun=true&destination=${encodeURIComponent(destination)}`,
    );
    expect(response.statusCode, response.body).toBe(200);
    return response.json<ImportReport>();
  };
  const run = async (files: Files, destination = '') => {
    const response = await upload(files, `?destination=${encodeURIComponent(destination)}`);
    expect(response.statusCode, response.body).toBe(200);
    return response.json<ImportReport>();
  };
  return { app, content, upload, preview, run };
}

function multipart(files: Files): Buffer {
  const parts: Buffer[] = [];
  for (const [name, data] of Object.entries(files))
    parts.push(
      Buffer.from(
        `--leandocs-import\r\nContent-Disposition: form-data; name="files"; filename="${name}"\r\nContent-Type: application/octet-stream\r\n\r\n`,
      ),
      Buffer.isBuffer(data) ? data : Buffer.from(data),
      Buffer.from('\r\n'),
    );
  parts.push(Buffer.from('--leandocs-import--\r\n'));
  return Buffer.concat(parts);
}

async function listFiles(dir: string, prefix = ''): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory())
      result.push(...(await listFiles(path.join(dir, entry.name), relative)));
    else result.push(relative);
  }
  return result.sort();
}

const ID = '7d9f3c1a-1111-4b6a-9c44-0f2f6a7b8c9d';
const withId = `---\r\nid: ${ID}\r\ntitle: Router\r\n# keep this comment\r\ntags: [network]\r\n---\r\n\r\nBody with CRLF.\r\n`;
const plain = '\uFEFF# Plain note\n\nNo front matter, [[Router]] link.\n';

describe('POST /api/v1/import (Markdown directory)', () => {
  it('previews the plan without writing anything', async () => {
    const { content, preview } = await setup();
    const before = await listFiles(content);
    const report = await preview({
      'Notes/Network/Router.md': withId,
      'Notes/Plain.md': plain,
      'Notes/image.png': Buffer.from([0x89, 0x50]),
      'Notes/.obsidian/app.json': '{}',
      'Notes/.obsidian/workspace.json': '{}',
      'Notes/Doc.assets/a.png': 'x',
    });
    expect(await listFiles(content)).toEqual(before);
    expect(report).toMatchObject({
      importer: 'markdown-directory',
      destination: '',
      dryRun: true,
      summary: { documents: 2, folders: 2, skipped: 3, failed: 0, warnings: 0 },
    });
    expect(report.items).toEqual([
      {
        source: 'Notes/.obsidian/',
        status: 'skipped',
        reason: 'Hidden folder (2 files)',
        notes: [],
        warnings: [],
      },
      {
        source: 'Notes/Doc.assets/',
        status: 'skipped',
        reason: 'Attachment folders are not imported yet (1 file)',
        notes: [],
        warnings: [],
      },
      {
        source: 'Notes/Network/Router.md',
        destination: 'Notes/Network/Router.md',
        status: 'ready',
        notes: [],
        warnings: [],
      },
      {
        source: 'Notes/Plain.md',
        destination: 'Notes/Plain.md',
        status: 'ready',
        notes: ['Adds missing front matter: id, title, created, updated'],
        warnings: [],
      },
      {
        source: 'Notes/image.png',
        status: 'skipped',
        reason: 'Only Markdown files are imported',
        notes: [],
        warnings: [],
      },
    ]);
  });

  it('imports the folder structure, keeps existing front matter byte-for-byte and adds missing ids', async () => {
    const { app, content, run } = await setup();
    const report = await run(
      { 'Notes/Network/Router.md': withId, 'Notes/Plain.md': plain },
      'Imported',
    );
    expect(report).toMatchObject({
      dryRun: false,
      summary: { documents: 2, folders: 3, failed: 0 },
    });
    expect(report.items.map((item) => [item.status, item.destination])).toEqual([
      ['imported', 'Imported/Notes/Network/Router.md'],
      ['imported', 'Imported/Notes/Plain.md'],
    ]);
    expect(await readFile(path.join(content, 'Imported/Notes/Network/Router.md'), 'utf8')).toBe(
      withId,
    );
    const added = await readFile(path.join(content, 'Imported/Notes/Plain.md'), 'utf8');
    expect(added).toMatch(
      /^\uFEFF---\nid: [0-9a-f-]{36}\ntitle: Plain note\ncreated: \S+Z\nupdated: \S+Z\n---\n\n# Plain note\n\nNo front matter, \[\[Router\]\] link\.\n$/,
    );
    expect(report.items[0]!.documentId).toBe(ID);
    const plainId = report.items[1]!.documentId!;
    expect(added).toContain(`id: ${plainId}`);
    const document = (await app.inject(`/api/v1/documents/${plainId}`)).json();
    expect(document).toMatchObject({ title: 'Plain note', path: 'Imported/Notes/Plain.md' });
    const links = (await app.inject(`/api/v1/documents/${plainId}/links`)).json();
    expect(JSON.stringify(links)).toContain(ID);
  });

  it('never overwrites and never reuses an id that is already in the library', async () => {
    const { content, run } = await setup();
    await run({ 'Router.md': withId });
    const second = await run({
      'Router.md': withId.replace('Body with CRLF.', 'Second copy.'),
      'Other.md': `---\nid: ${ID}\n---\nSame id.\n`,
      'Third.md': '---\nid: shared-id\n---\nA\n',
      'Fourth.md': '---\nid: shared-id\n---\nB\n',
    });
    expect(await readFile(path.join(content, 'Router.md'), 'utf8')).toBe(withId);
    const byName = Object.fromEntries(second.items.map((item) => [item.source, item]));
    expect(byName['Router.md']).toMatchObject({
      destination: 'Router (2).md',
      status: 'imported',
      warnings: [
        'A document named "Router.md" already exists; imported as "Router (2).md". Links to the original name need updating',
        'The document id is already used in the library; a new id is assigned',
      ],
    });
    expect(byName['Other.md']!.warnings).toEqual([
      'The document id is already used in the library; a new id is assigned',
    ]);
    // Code-point order decides which duplicate keeps its id, as in the index (D-13).
    expect(byName['Fourth.md']).toMatchObject({ documentId: 'shared-id', warnings: [] });
    expect(byName['Third.md']!.warnings).toEqual([
      'Another file in this import has the same document id; a new id is assigned',
    ]);
    const copy = await readFile(path.join(content, 'Router (2).md'), 'utf8');
    expect(copy).toBe(
      withId
        .replace(`id: ${ID}`, `id: ${byName['Router.md']!.documentId}`)
        .replace('Body with CRLF.', 'Second copy.'),
    );
    expect(new Set(second.items.map((item) => item.documentId)).size).toBe(4);
  });

  it('keeps unusable front matter unchanged and skips what cannot be imported safely', async () => {
    const { content, run } = await setup();
    const before = await listFiles(content);
    const invalid = '---\ntitle: [unclosed\n---\nBody\n';
    const badId = '---\nid: "bad id/with slash"\n---\nBody\n';
    const big = Buffer.alloc(MAX_IMPORT_DOCUMENT_BYTES + 1, 'a');
    const report = await run({
      'Invalid.md': invalid,
      'Bad id.md': badId,
      'Latin1.md': Buffer.from([0x63, 0x61, 0x66, 0xe9]),
      'Big.md': big,
      'What: now?.md': '# Q\n',
      '_private/Secret.md': '# S\n',
      'con/Reserved.md': '# R\n',
      '.hidden.md': '# H\n',
    });
    const byName = Object.fromEntries(report.items.map((item) => [item.source, item]));
    expect(await readFile(path.join(content, 'Invalid.md'), 'utf8')).toBe(invalid);
    expect(byName['Invalid.md']!.warnings[0]).toMatch(/front matter is invalid/);
    expect(await readFile(path.join(content, 'Bad id.md'), 'utf8')).toBe(badId);
    expect(byName['Bad id.md']!.warnings[0]).toMatch(/id is not usable/);
    expect(byName['Latin1.md']).toMatchObject({
      status: 'skipped',
      reason: 'The file is not UTF-8 text',
    });
    expect(byName['Big.md']).toMatchObject({ status: 'skipped', reason: 'Larger than 10 MiB' });
    expect(byName['What: now?.md']).toMatchObject({
      status: 'imported',
      destination: 'What- now-.md',
      warnings: ['Renamed to a safe name: What- now-.md'],
    });
    expect(byName['_private/Secret.md']).toMatchObject({ status: 'skipped' });
    expect(byName['_private/Secret.md']!.reason).toMatch(/reserved; choose a destination folder/);
    expect(byName['con/Reserved.md']).toMatchObject({
      status: 'skipped',
      reason: 'Invalid name: "con" is a reserved name',
    });
    expect(byName['.hidden.md']).toMatchObject({ status: 'skipped', reason: 'Hidden file' });
    expect(await listFiles(content)).toEqual(
      [...before, 'Bad id.md', 'Invalid.md', 'What- now-.md'].sort(),
    );
    // The same root-level `_` folder is ordinary inside a destination folder (D-12).
    const nested = await run({ '_private/Secret.md': '# S\n' }, 'Archive');
    expect(nested.items[0]).toMatchObject({
      status: 'imported',
      destination: 'Archive/_private/Secret.md',
    });
  });

  it('rejects unsafe requests without writing anything', async () => {
    const { app, content, upload } = await setup();
    const before = await listFiles(content);
    const cases: [Files, string, number, string][] = [
      [{ '../evil.md': '# x' }, '', 400, 'INVALID_UPLOAD'],
      [{ '/abs.md': '# x' }, '', 400, 'INVALID_UPLOAD'],
      [{ 'a.md': '# a', 'b.png': 'x' }, '?destination=../out', 400, 'UNSAFE_PATH'],
      [{ 'a.md': '# a' }, '?destination=_trash', 400, 'INVALID_FOLDER'],
      [{ 'a.md': '# a' }, '?destination=Bad:name', 400, 'INVALID_NAME'],
      [{ 'a.png': 'x' }, '', 400, 'IMPORT_UNSUPPORTED'],
      [{}, '', 400, 'IMPORT_EMPTY'],
      [{ 'a.md': '# a' }, '?importer=html', 400, 'VALIDATION_ERROR'],
    ];
    for (const [files, query, status, code] of cases) {
      const response = await upload(files, query);
      expect(response.statusCode, `${query} ${Object.keys(files).join()}`).toBe(status);
      expect(response.json().error.code).toBe(code);
    }
    const twice = multipart({ 'a.md': '# a' });
    const repeated = await app.inject({
      method: 'POST',
      url: '/api/v1/import',
      headers: { 'content-type': 'multipart/form-data; boundary=leandocs-import' },
      payload: Buffer.concat([twice.subarray(0, twice.length - 21), twice]),
    });
    expect(repeated.statusCode).toBe(400);
    expect(repeated.json().error.message).toBe('Invalid or repeated file path: "a.md"');
    expect(await listFiles(content)).toEqual(before);
  });

  it('requires authentication and a CSRF token', async () => {
    const { content, upload } = await setup();
    const before = await listFiles(content);
    expect((await upload({ 'a.md': '# a' }, '', { cookie: '' })).statusCode).toBe(401);
    expect((await upload({ 'a.md': '# a' }, '', { 'x-leandocs-csrf': 'wrong' })).statusCode).toBe(
      403,
    );
    expect(await listFiles(content)).toEqual(before);
  });

  it('places a selection into an existing folder and merges folders', async () => {
    const { content, run } = await setup();
    await mkdir(path.join(content, 'Team'));
    await writeFile(path.join(content, 'Team/Existing.md'), '# Existing\n');
    const report = await run({ 'Team/New.md': '# New\n' });
    expect(report).toMatchObject({ summary: { documents: 1, folders: 0 } });
    expect(await listFiles(path.join(content, 'Team'))).toEqual(['Existing.md', 'New.md']);
  });
});
