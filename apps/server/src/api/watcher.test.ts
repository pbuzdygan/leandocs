import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../config/config.js';
import { DocumentRegistry } from '../documents/registry.js';
import { buildApp } from '../test/authenticated-app.js';
import { makeTempDir } from '../test/temp-dir.js';

const ID = '77ce39fd-03cd-4d78-9e8f-87828449e0aa';
const apps: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  vi.restoreAllMocks();
});

describe('watcher-driven API reads', () => {
  it('serves indexed views without full scans and picks up external edits through event paths', async () => {
    const data = await makeTempDir();
    const content = path.join(data, 'content');
    await mkdir(content);
    const file = path.join(content, 'Doc.md');
    await writeFile(file, `---\nid: ${ID}\n---\nzebra\n`);
    const app = await buildApp(loadConfig({ DATA_DIR: data, LOG_LEVEL: 'silent' }), true);
    apps.push(app);
    const refresh = vi.spyOn(DocumentRegistry.prototype, 'refresh');
    for (const url of [
      '/tree',
      '/documents/recent',
      '/tags',
      '/pins',
      '/search?q=zebra',
      `/documents/${ID}/links`,
      `/documents/${ID}/backlinks`,
      '/links/broken',
      `/documents/${ID}/attachments`,
      '/index/status',
    ]) {
      expect((await app.inject({ method: 'GET', url: `/api/v1${url}` })).statusCode, url).toBe(200);
    }
    expect(refresh).not.toHaveBeenCalled();

    const revision = (await app.inject({ method: 'GET', url: `/api/v1/documents/${ID}` })).json()
      .revision;
    await writeFile(file, `---\nid: ${ID}\n---\ntiger\n`);
    // Save protection reads real bytes even before the watcher has indexed the external edit.
    const save = await app.inject({
      method: 'PUT',
      url: `/api/v1/documents/${ID}`,
      payload: { content: 'overwrite', expectedRevision: revision },
    });
    expect(save.statusCode).toBe(409);
    expect(await readFile(file, 'utf8')).toContain('tiger');
    await vi.waitFor(
      async () => {
        const response = await app.inject({ method: 'GET', url: '/api/v1/search?q=tiger' });
        expect(response.json().results).toMatchObject([{ id: ID }]);
      },
      { timeout: 5000 },
    );
    expect(refresh).toHaveBeenCalledWith(['Doc.md']);
    expect(refresh.mock.calls.every(([paths]) => paths !== undefined && !paths.includes(''))).toBe(
      true,
    );
  });
});
