import { mkdir, readdir, readFile, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../test/authenticated-app.js';
import { loadConfig } from '../config/config.js';
import { makeTempDir } from '../test/temp-dir.js';

const apps: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=',
  'base64',
);

async function setup(limit = 4096) {
  const root = await makeTempDir();
  const app = await buildApp(
    loadConfig({ DATA_DIR: root, LOG_LEVEL: 'silent', MAX_UPLOAD_SIZE: String(limit) }),
  );
  apps.push(app);
  const created = await app.inject({
    method: 'POST',
    url: '/api/v1/documents',
    payload: { name: 'Doc', folder: '', content: 'Text\n' },
  });
  const id = created.json().id as string;
  const base = `/api/v1/documents/${id}/attachments`;
  const upload = (name: string, mime: string, bytes: Buffer, extra = '') =>
    app.inject({
      method: 'POST',
      url: base,
      headers: { 'content-type': 'multipart/form-data; boundary=leandocs-test' },
      payload: Buffer.concat([
        Buffer.from(
          `--leandocs-test\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: ${mime}\r\n\r\n`,
        ),
        bytes,
        Buffer.from(`\r\n${extra}--leandocs-test--\r\n`),
      ]),
    });
  return { app, id, base, upload, content: path.join(root, 'content') };
}

describe('attachment API', () => {
  it('uploads, lists, serves and deletes while keeping original bytes and portable links', async () => {
    const { app, base, upload, content } = await setup();
    expect((await app.inject(base)).json()).toEqual({ items: [] });
    const res = await upload('picture.png', 'image/png', png);
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      name: 'picture.png',
      size: png.length,
      mime: 'image/png',
      image: true,
      markdownUrl: 'Doc.assets/picture.png',
    });
    expect(await readFile(path.join(content, 'Doc.assets/picture.png'))).toEqual(png);
    const image = await app.inject(`${base}/picture.png`);
    expect(image.rawPayload).toEqual(png);
    expect(image.headers['content-type']).toBe('image/png');
    expect(image.headers['content-disposition']).toMatch(/^inline/);
    expect(image.headers['x-content-type-options']).toBe('nosniff');
    expect(
      (await app.inject(`${base}/picture.png?download=1`)).headers['content-disposition'],
    ).toMatch(/^attachment/);
    expect((await app.inject(base)).json().items).toHaveLength(1);
    expect((await app.inject('/api/v1/tree')).json().root.children).toHaveLength(1);
    expect((await app.inject({ method: 'DELETE', url: `${base}/picture.png` })).statusCode).toBe(
      204,
    );
    expect((await app.inject(`${base}/picture.png`)).statusCode).toBe(404);
  });

  it('avoids collisions, preserves Unicode names and forces download for generic files', async () => {
    const { app, upload } = await setup();
    const first = await upload('notes.txt', 'text/plain', Buffer.from('first'));
    const second = await upload('notes.txt', 'text/plain', Buffer.from('second'));
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    expect(second.json().name).not.toBe(first.json().name);
    expect((await app.inject(first.json().url)).body).toBe('first');
    const unicode = await upload('Zażółć.json', 'application/json', Buffer.from('{}'));
    expect(unicode.statusCode).toBe(201);
    const res = await app.inject(unicode.json().url);
    expect(res.headers['content-disposition']).toContain(
      "filename*=UTF-8''Za%C5%BC%C3%B3%C5%82%C4%87.json",
    );
    expect(res.headers['content-disposition']).toMatch(/^attachment/);
  });

  it.each([
    ['../escape.txt', 'text/plain', Buffer.from('hi')],
    ['..\\escape.txt', 'text/plain', Buffer.from('hi')],
    ['.hidden.txt', 'text/plain', Buffer.from('hi')],
    ['run.exe', 'application/octet-stream', Buffer.from('MZhello')],
    ['run.txt', 'text/plain', Buffer.from('#!/bin/sh\necho hi')],
    ['run.txt', 'text/plain', Buffer.from('MZhello')],
    ['fake.png', 'image/png', Buffer.from('not a PNG')],
    ['picture.png', 'application/pdf', png],
    ['bad.json', 'application/json', Buffer.from('{')],
    ['bad.svg', 'image/svg+xml', Buffer.from('<!DOCTYPE svg><svg/>')],
    ['bad.txt', 'text/plain', Buffer.from([255, 0])],
  ])('rejects unsafe or mismatched %s', async (name, mime, bytes) => {
    const { upload, content } = await setup();
    expect((await upload(name, mime, bytes)).statusCode).toBe(400);
    // No attachments folder was created (`_templates` is the seeded system folder, P10-01).
    expect((await readdir(content)).filter((name) => name !== '_templates')).toEqual(['Doc.md']);
  });

  it('encodes Markdown and download punctuation safely', async () => {
    const { app, upload } = await setup();
    const result = await upload(
      "photo)('x.svg",
      'image/svg+xml',
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
    );
    expect(result.statusCode).toBe(201);
    expect(result.json().markdownUrl).toBe('Doc.assets/photo%29%28%27x.svg');
    expect((await app.inject(result.json().url)).headers['content-disposition']).toContain(
      "filename*=UTF-8''photo%29%28%27x.svg",
    );
  });

  it('enforces the exact size boundary and rejects additional parts without orphan files', async () => {
    const { upload, content } = await setup(16);
    expect((await upload('small.txt', 'text/plain', Buffer.alloc(16, 97))).statusCode).toBe(201);
    expect((await upload('large.txt', 'text/plain', Buffer.alloc(17, 97))).statusCode).toBe(413);
    const extra =
      '--leandocs-test\r\nContent-Disposition: form-data; name="file"; filename="second.txt"\r\nContent-Type: text/plain\r\n\r\nsecond\r\n';
    expect((await upload('orphan.txt', 'text/plain', Buffer.from('first'), extra)).statusCode).toBe(
      413,
    );
    expect(await readdir(path.join(content, 'Doc.assets'))).toEqual(['small.txt']);
  });

  it('sandboxes SVG including scripts, preserves the original file and prevents HTML sniffing', async () => {
    const { app, upload } = await setup();
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    );
    const res = await upload('diagram.svg', 'image/svg+xml', svg);
    expect(res.statusCode).toBe(201);
    const served = await app.inject(res.json().url);
    expect(served.rawPayload).toEqual(svg);
    expect(served.headers['content-type']).toBe('image/svg+xml');
    expect(served.headers['content-security-policy']).toContain(
      "sandbox; default-src 'none'; script-src 'none'",
    );
  });

  it('rejects asset-directory and file symlinks, including reads and deletion', async () => {
    const { app, upload, base, content } = await setup();
    const outside = await makeTempDir();
    await writeFile(path.join(outside, 'secret.txt'), 'secret');
    await symlink(outside, path.join(content, 'Doc.assets'));
    expect((await upload('new.txt', 'text/plain', Buffer.from('hi'))).statusCode).toBe(400);
    expect((await app.inject(`${base}/secret.txt`)).statusCode).toBe(400);
    expect(await readdir(outside)).toEqual(['secret.txt']);
    const second = await setup();
    await mkdir(path.join(second.content, 'Doc.assets'));
    await symlink(
      path.join(outside, 'secret.txt'),
      path.join(second.content, 'Doc.assets/secret.txt'),
    );
    expect((await second.app.inject(second.base)).json().items).toEqual([]);
    expect((await second.app.inject(`${second.base}/secret.txt`)).statusCode).toBe(404);
    expect(
      (await second.app.inject({ method: 'DELETE', url: `${second.base}/secret.txt` })).statusCode,
    ).toBe(404);
    expect(await readFile(path.join(outside, 'secret.txt'), 'utf8')).toBe('secret');
  });

  it('keeps files available after move, rename, trash and restore, and rewrites own asset links', async () => {
    const { app, id, upload, base } = await setup();
    await upload('picture.png', 'image/png', png);
    const doc = (await app.inject(`/api/v1/documents/${id}`)).json();
    await app.inject({
      method: 'PUT',
      url: `/api/v1/documents/${id}`,
      payload: { content: '![shot](Doc.assets/picture.png)', expectedRevision: doc.revision },
    });
    await app.inject({
      method: 'POST',
      url: `/api/v1/documents/${id}/move`,
      payload: { folder: 'Moved', createFolders: true },
    });
    const renamed = await app.inject({
      method: 'POST',
      url: `/api/v1/documents/${id}/rename`,
      payload: { name: 'New Doc' },
    });
    expect(renamed.json().content).toBe('![shot](New%20Doc.assets/picture.png)');
    expect((await app.inject(`${base}/picture.png`)).rawPayload).toEqual(png);
    const trashed = await app.inject({ method: 'DELETE', url: `/api/v1/documents/${id}` });
    expect((await app.inject(base)).statusCode).toBe(404);
    await app.inject({ method: 'POST', url: `/api/v1/trash/${trashed.json().trashId}/restore` });
    expect((await app.inject(`${base}/picture.png`)).rawPayload).toEqual(png);
  });
});
