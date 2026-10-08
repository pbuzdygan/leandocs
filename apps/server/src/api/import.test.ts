import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  IMPORT_NAME_ONLY_TYPE,
  MAX_IMPORT_DOCUMENT_BYTES,
  type ImportReport,
} from '@leandocs/shared';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../test/authenticated-app.js';
import { loadConfig } from '../config/config.js';
import { makeTempDir } from '../test/temp-dir.js';

const apps: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

type Part = string | Buffer | { data: string | Buffer; type: string };
type Files = Record<string, Part>;

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
  for (const [name, part] of Object.entries(files)) {
    const { data, type } =
      typeof part === 'object' && !Buffer.isBuffer(part)
        ? part
        : { data: part, type: 'application/octet-stream' };
    parts.push(
      Buffer.from(
        `--leandocs-import\r\nContent-Disposition: form-data; name="files"; filename="${name}"\r\nContent-Type: ${type}\r\n\r\n`,
      ),
      Buffer.isBuffer(data) ? data : Buffer.from(data),
      Buffer.from('\r\n'),
    );
  }
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
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=',
  'base64',
);
const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n');
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
      summary: { documents: 2, attachments: 0, folders: 2, skipped: 3, failed: 0, warnings: 0 },
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
        source: 'Notes/Doc.assets/a.png',
        status: 'skipped',
        reason: 'Not used by any imported document',
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
        reason: 'Not used by any imported document',
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
        'A document named "Router.md" already exists; imported as "Router (2).md"',
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
      [{ 'a.md': '# a' }, '?importer=poznote', 400, 'VALIDATION_ERROR'],
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

  it('converts HTML files to Markdown documents with a report and never stores the HTML', async () => {
    const { content, upload } = await setup();
    const files = {
      'Export/Old note.html':
        '<html><head><title>Old note</title></head><body><h1>Old</h1><p>See <a href="Other.html">other</a>.</p><script>x()</script></body></html>',
      'Export/Other.htm': '<p>Second page</p>',
      'Export/readme.md': '# Not HTML\n',
    };
    const preview = await upload(files, '?importer=html&dryRun=true');
    expect(preview.statusCode, preview.body).toBe(200);
    expect(preview.json<ImportReport>().items).toEqual([
      {
        source: 'Export/Old note.html',
        destination: 'Export/Old note.md',
        status: 'ready',
        converted: true,
        notes: [
          'Links to an HTML page now point to the converted Markdown file',
          'Adds missing front matter: id, created, updated',
        ],
        warnings: ['Removed a script that Markdown cannot contain'],
      },
      {
        source: 'Export/Other.htm',
        destination: 'Export/Other.md',
        status: 'ready',
        converted: true,
        notes: ['Adds missing front matter: id, title, created, updated'],
        warnings: [],
      },
      {
        source: 'Export/readme.md',
        status: 'skipped',
        reason: 'Only HTML files are converted',
        notes: [],
        warnings: [],
      },
    ]);
    const response = await upload(files, '?importer=html');
    expect(response.statusCode, response.body).toBe(200);
    expect(await listFiles(path.join(content, 'Export'))).toEqual(['Old note.md', 'Other.md']);
    expect(await readFile(path.join(content, 'Export/Old note.md'), 'utf8')).toMatch(
      /^---\ntitle: Old note\nid: [0-9a-f-]{36}\ncreated: \S+\nupdated: \S+\n---\n\n# Old\n\nSee \[other\]\(Other\.md\)\.\n$/,
    );
    const markdownOnly = await upload({ 'a.md': '# a' }, '?importer=html');
    expect(markdownOnly.json().error.message).toBe('No HTML files were found in the selection');
  });

  it('skips an HTML file too deeply nested to convert and imports the rest', async () => {
    const { content, upload } = await setup();
    const response = await upload(
      {
        'Deep.html': `<html><body>${'<div>'.repeat(5_000)}x</body></html>`,
        'Fine.html': '<html><body><p>Fine</p></body></html>',
      },
      '?importer=html',
    );
    expect(response.statusCode, response.body).toBe(200);
    const report = response.json<ImportReport>();
    expect(report.items.find((item) => item.source === 'Deep.html')).toMatchObject({
      status: 'skipped',
      reason: 'The file cannot be converted: it is nested too deeply',
    });
    expect(await readFile(path.join(content, 'Fine.md'), 'utf8')).toContain('Fine');
    expect((await readdir(content)).filter((name) => name.endsWith('.md'))).toEqual(['Fine.md']);
  });

  it('copies referenced files next to each document and re-points only those links', async () => {
    const { content, upload } = await setup();
    const router = [
      '# Router',
      '',
      '![Diagram](img/diagram.png "Network")',
      '[Manual](../Shared/manual.pdf) and ![again](./img/diagram.png)',
      '![Map][map] [video](movie.mp4) ![fake](fake.png) ![gone](img/missing.png)',
      '[Other](Other.md) [[Other]] https://example.com/x.png `img/diagram.png`',
      '',
      '[map]: <img/net map.png>',
      '',
    ].join('\n');
    const other = '# Other\n\n![Same diagram](img/diagram.png)\n';
    const binaries: Record<string, { data: Buffer; type: string }> = {
      'Lib/Notes/img/diagram.png': { data: png, type: 'image/png' },
      'Lib/Notes/img/net map.png': { data: png, type: 'image/png' },
      'Lib/Shared/manual.pdf': { data: pdf, type: 'application/pdf' },
      'Lib/Notes/movie.mp4': { data: Buffer.from('video'), type: 'video/mp4' },
      'Lib/Notes/fake.png': { data: Buffer.from('not an image'), type: 'image/png' },
      'Lib/Notes/unused.png': { data: png, type: 'image/png' },
    };
    const documents = { 'Lib/Notes/Router.md': router, 'Lib/Notes/Other.md': other };
    // The browser previews with names only, then sends the files the preview attached.
    const nameOnly = Object.fromEntries(
      Object.keys(binaries).map((name) => [name, { data: '', type: IMPORT_NAME_ONLY_TYPE }]),
    );
    const previewResponse = await upload({ ...documents, ...nameOnly }, '?dryRun=true');
    expect(previewResponse.statusCode, previewResponse.body).toBe(200);
    const preview = previewResponse.json<ImportReport>();
    expect(preview.summary).toMatchObject({ documents: 2, attachments: 5 });
    expect(
      preview.items.map((item) => [item.source, item.status, item.destination, item.attachmentOf]),
    ).toEqual([
      ['Lib/Notes/Other.md', 'ready', 'Lib/Notes/Other.md', undefined],
      [
        'Lib/Notes/img/diagram.png',
        'ready',
        'Lib/Notes/Other.assets/diagram.png',
        'Lib/Notes/Other.md',
      ],
      ['Lib/Notes/Router.md', 'ready', 'Lib/Notes/Router.md', undefined],
      [
        'Lib/Notes/img/diagram.png',
        'ready',
        'Lib/Notes/Router.assets/diagram.png',
        'Lib/Notes/Router.md',
      ],
      [
        'Lib/Shared/manual.pdf',
        'ready',
        'Lib/Notes/Router.assets/manual.pdf',
        'Lib/Notes/Router.md',
      ],
      // In document order: the `[map]:` definition comes last. Contents are checked on import.
      ['Lib/Notes/fake.png', 'ready', 'Lib/Notes/Router.assets/fake.png', 'Lib/Notes/Router.md'],
      [
        'Lib/Notes/img/net map.png',
        'ready',
        'Lib/Notes/Router.assets/net map.png',
        'Lib/Notes/Router.md',
      ],
      ['Lib/Notes/movie.mp4', 'skipped', undefined, undefined],
      ['Lib/Notes/unused.png', 'skipped', undefined, undefined],
    ]);
    const attached = new Set(
      preview.items.filter((item) => item.attachmentOf).map((item) => item.source),
    );
    const selection = Object.fromEntries(
      Object.entries(binaries).map(([name, part]) => [
        name,
        attached.has(name) ? part : nameOnly[name]!,
      ]),
    );
    const response = await upload({ ...documents, ...selection });
    expect(response.statusCode, response.body).toBe(200);
    const report = response.json<ImportReport>();
    expect(report.summary).toMatchObject({ documents: 2, attachments: 4, failed: 0 });
    const byKey = Object.fromEntries(
      report.items.map((item) => [`${item.attachmentOf ?? ''}>${item.source}`, item]),
    );
    expect(byKey['>Lib/Notes/Router.md']!.warnings).toEqual([
      'Kept the link to Lib/Notes/movie.mp4: this file type cannot be attached',
      'Kept the link to Lib/Notes/fake.png: the file contents do not match its type',
      'Linked file is not in the selection, so the link was kept: Lib/Notes/img/missing.png',
    ]);
    expect(byKey['>Lib/Notes/Router.md']!.notes).toContain(
      'Copies 3 attachments next to the document and updates the links',
    );
    expect(byKey['>Lib/Notes/fake.png']).toMatchObject({
      status: 'skipped',
      reason: 'Cannot be attached: the file contents do not match its type',
    });
    expect(byKey['>Lib/Notes/unused.png']!.reason).toBe('Not used by any imported document');

    const written = await readFile(path.join(content, 'Lib/Notes/Router.md'), 'utf8');
    expect(written.slice(written.indexOf('# Router'))).toBe(
      [
        '# Router',
        '',
        '![Diagram](Router.assets/diagram.png "Network")',
        '[Manual](Router.assets/manual.pdf) and ![again](./Router.assets/diagram.png)',
        '![Map][map] [video](movie.mp4) ![fake](fake.png) ![gone](img/missing.png)',
        '[Other](Other.md) [[Other]] https://example.com/x.png `img/diagram.png`',
        '',
        '[map]: <Router.assets/net map.png>',
        '',
      ].join('\n'),
    );
    expect(await readFile(path.join(content, 'Lib/Notes/Other.md'), 'utf8')).toContain(
      '![Same diagram](Other.assets/diagram.png)',
    );
    expect(await listFiles(path.join(content, 'Lib'))).toEqual([
      'Notes/Other.assets/diagram.png',
      'Notes/Other.md',
      'Notes/Router.assets/diagram.png',
      'Notes/Router.assets/manual.pdf',
      'Notes/Router.assets/net map.png',
      'Notes/Router.md',
    ]);
    expect(await readFile(path.join(content, 'Lib/Notes/Router.assets/manual.pdf'))).toEqual(pdf);
  });

  it('copies images that converted HTML pages refer to', async () => {
    const { content, upload } = await setup();
    const response = await upload(
      {
        'Site/page.html': '<h1>Page</h1><p><img src="img/logo.png" alt="Logo"></p>',
        'Site/img/logo.png': { data: png, type: 'image/png' },
      },
      '?importer=html',
    );
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json<ImportReport>().summary).toMatchObject({ documents: 1, attachments: 1 });
    expect(await readFile(path.join(content, 'Site/page.md'), 'utf8')).toContain(
      '![Logo](page.assets/logo.png)',
    );
    expect(await readFile(path.join(content, 'Site/page.assets/logo.png'))).toEqual(png);
  });

  it('imports an Obsidian vault: file embeds become Markdown with copied attachments', async () => {
    const { content, run } = await setup();
    const daily = [
      '# Daily',
      '',
      '![[Pasted image 1.png]]',
      '![[diagram.png|300]]',
      '![[Topology note]]',
      '[[manual.pdf|Manual]] and [[Topology note|see topology]]',
      '`![[code.png]]` ![[missing.png]] ![[clip.mp4]]',
      '',
      '```',
      '![[diagram.png]]',
      '```',
      '',
    ].join('\n');
    const report = await run({
      'Vault/.obsidian/app.json': '{}',
      'Vault/Daily/2024-01-01.md': daily,
      'Vault/Daily/diagram.png': { data: png, type: 'image/png' },
      'Vault/attachments/diagram.png': { data: png, type: 'image/png' },
      'Vault/attachments/Pasted image 1.png': { data: png, type: 'image/png' },
      'Vault/manual.pdf': { data: pdf, type: 'application/pdf' },
      'Vault/clip.mp4': { data: Buffer.from('video'), type: 'video/mp4' },
      'Vault/Topology note.md': '# Topology\n',
    });
    const note = report.items.find((item) => item.source === 'Vault/Daily/2024-01-01.md')!;
    expect(note.notes).toContain('Turns Obsidian file embeds and links into standard Markdown');
    expect(note.warnings).toEqual([
      'Several files match "diagram.png"; the one closest to the note was used: Vault/Daily/diagram.png',
      'Kept the link to Vault/clip.mp4: this file type cannot be attached',
      'An embedded note is shown as a link, because LeanDocs does not show one note inside another',
      'Image sizes set in Obsidian were not kept',
      'Linked file is not in the selection, so the link was kept: missing.png',
    ]);
    const written = await readFile(path.join(content, 'Vault/Daily/2024-01-01.md'), 'utf8');
    expect(written.slice(written.indexOf('# Daily'))).toBe(
      [
        '# Daily',
        '',
        '![Pasted image 1](2024-01-01.assets/Pasted%20image%201.png)',
        '![diagram](2024-01-01.assets/diagram.png)',
        '[[Topology note]]',
        '[Manual](2024-01-01.assets/manual.pdf) and [[Topology note|see topology]]',
        '`![[code.png]]` ![[missing.png]] ![[clip.mp4]]',
        '',
        '```',
        '![[diagram.png]]',
        '```',
        '',
      ].join('\n'),
    );
    expect(await listFiles(path.join(content, 'Vault'))).toEqual([
      'Daily/2024-01-01.assets/Pasted image 1.png',
      'Daily/2024-01-01.assets/diagram.png',
      'Daily/2024-01-01.assets/manual.pdf',
      'Daily/2024-01-01.md',
      'Topology note.md',
    ]);
    expect(report.summary).toMatchObject({ documents: 2, attachments: 3, failed: 0 });
  });

  it('leaves the text of an ordinary Markdown library unchanged', async () => {
    const { content, run } = await setup();
    // Everything an ordinary library uses: wiki links, links, images, code with look-alikes.
    const body = [
      '# Guide',
      '',
      'See [[Setup]], [[Setup|the setup]], [[Setup#Install]] and [setup](Setup.md#install).',
      'Remote ![logo](https://example.com/logo.png) and [site](https://example.com).',
      '> [!NOTE]',
      '> GitHub-style note.',
      '',
      'Inline `![[not-an-embed.png]]` and `[[Setup]]`.',
      '',
      '```markdown',
      '![[diagram.png]] [[file.pdf]]',
      '```',
      '',
    ].join('\n');
    const report = await run({ 'Lib/Guide.md': body, 'Lib/Setup.md': '# Setup\n' });
    expect(report.items.map((item) => [item.source, item.status, item.warnings])).toEqual([
      ['Lib/Guide.md', 'imported', []],
      ['Lib/Setup.md', 'imported', []],
    ]);
    const written = await readFile(path.join(content, 'Lib/Guide.md'), 'utf8');
    // Only the generated front matter is new; the Markdown is byte-for-byte the original.
    expect(written).toMatch(
      /^---\nid: [0-9a-f-]{36}\ntitle: Guide\ncreated: \S+\nupdated: \S+\n---\n\n/,
    );
    expect(written.slice(written.indexOf('# Guide'))).toBe(body);
  });

  it('imports a document too large to analyse unchanged, without following its links', async () => {
    const { content, run } = await setup();
    const line = 'Plain words.\n';
    const body = `![pic](pic.png)\n\n${line.repeat(Math.ceil((3 * 1024 * 1024) / line.length))}`;
    const report = await run({ 'Huge.md': body, 'pic.png': { data: png, type: 'image/png' } });
    const item = report.items.find((entry) => entry.source === 'Huge.md')!;
    expect(item.status).toBe('imported');
    expect(item.warnings).toContain(
      'Imported unchanged without checking its links or attachments: the document is larger than 2 MiB',
    );
    // Only the identity front matter is added; the picture stays where it was.
    expect(await readFile(path.join(content, 'Huge.md'), 'utf8')).toMatch(
      /^---\nid: .+\n---\n\n!\[pic\]\(pic\.png\)\n/s,
    );
    expect(report.summary.attachments).toBe(0);
  });

  it('keeps links between imported documents working when one has to be renamed', async () => {
    const { content, run } = await setup();
    await writeFile(path.join(content, 'Other.md'), '# Existing other\n');
    const report = await run({
      'Index.md': '# Index\n\nSee [other](Other.md#setup) and [[Other]].\n',
      'Other.md': '# Other\n\n![pic](pic.png)\n',
      'pic.png': { data: png, type: 'image/png' },
    });
    expect(report.items.find((item) => item.source === 'Other.md')!.destination).toBe(
      'Other (2).md',
    );
    expect(await readFile(path.join(content, 'Index.md'), 'utf8')).toContain(
      'See [other](Other%20%282%29.md#setup) and [[Other]].',
    );
    expect(await readFile(path.join(content, 'Other (2).md'), 'utf8')).toContain(
      '![pic](Other%20%282%29.assets/pic.png)',
    );
    expect(await readFile(path.join(content, 'Other (2).assets/pic.png'))).toEqual(png);
    // Untouched apart from the id the index gives every document (D-10).
    expect(await readFile(path.join(content, 'Other.md'), 'utf8')).toMatch(
      /^---\nid: .+\n---\n\n# Existing other\n$/s,
    );
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
