import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { BrokenLinksResponse } from '@leandocs/shared';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../test/authenticated-app.js';
import { loadConfig } from '../config/config.js';
import { makeTempDir } from '../test/temp-dir.js';

/** P9-05 (PROJECT_SPEC §26): renaming or moving keeps links working, on disk. */

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

const FILES: Record<string, string> = {
  'Network/UniFi.md': [
    '---',
    'id: unifi',
    'title: UniFi',
    '---',
    'Uplink is [the switch](sw01.md); backups in [procedure](../Procedures/Backup.md).',
    '',
    '![diagram](UniFi.assets/diagram.png)',
    '',
  ].join('\n'),
  'Network/UniFi.assets/diagram.png': 'png',
  'Network/sw01.md': '---\nid: sw01\ntitle: Core switch\n---\nBack to [[UniFi]].\n',
  'Procedures/Backup.md': '---\nid: backup\ntitle: Backup\n---\nNothing.\n',
  'Applications/Home Assistant.md': [
    '---',
    'id: ha',
    'title: Home Assistant',
    '---',
    'Controller: [UniFi](../Network/UniFi.md#vlans), [[UniFi]], [[Network/UniFi]] and [[sw01]].',
    '',
    '`[UniFi](../Network/UniFi.md)` stays literal.',
    '',
  ].join('\n'),
};

async function start(): Promise<{
  api: FastifyInstance;
  content: string;
  read: (file: string) => Promise<string>;
}> {
  const dataDir = await makeTempDir();
  const content = path.join(dataDir, 'content');
  for (const [relative, text] of Object.entries(FILES)) {
    const file = path.join(content, relative);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, text);
  }
  app = await buildApp(loadConfig({ LOG_LEVEL: 'silent', DATA_DIR: dataDir }));
  return { api: app, content, read: (file) => readFile(path.join(content, file), 'utf8') };
}

async function post(api: FastifyInstance, url: string, payload: object) {
  const res = await api.inject({ method: 'POST', url: `/api/v1${url}`, payload });
  expect(res.statusCode, res.body).toBe(200);
}

async function broken(api: FastifyInstance) {
  const res = await api.inject({ method: 'GET', url: '/api/v1/links/broken' });
  return res.json<BrokenLinksResponse>().items;
}

describe('link updates on rename and move', () => {
  it('rename: other documents follow the new file name; title links stay', async () => {
    const { api, read } = await start();
    await post(api, '/documents/unifi/rename', { name: 'UniFi Controller' });
    const ha = await read('Applications/Home Assistant.md');
    expect(ha).toContain('[UniFi](../Network/UniFi%20Controller.md#vlans)');
    expect(ha).toContain('[[UniFi]]'); // resolves by title
    expect(ha).toContain('[[Network/UniFi Controller]]'); // path-style link rewritten
    expect(ha).toContain('`[UniFi](../Network/UniFi.md)` stays literal.');
    // Own attachment link follows the renamed .assets folder.
    expect(await read('Network/UniFi Controller.md')).toContain(
      '![diagram](UniFi%20Controller.assets/diagram.png)',
    );
    expect(await broken(api)).toEqual([]);
  });

  it('rename with a new title updates links that used the old title', async () => {
    const { api, read } = await start();
    await post(api, '/documents/sw01/rename', { name: 'sw01', title: 'Core switch 01' });
    // [[sw01]] still resolves by file name and is kept.
    expect(await read('Applications/Home Assistant.md')).toContain('[[sw01]]');
    // File name and title both change: [[UniFi]] would break, so it follows the new title.
    await post(api, '/documents/unifi/rename', { name: 'Controller', title: 'UniFi Network' });
    expect(await read('Network/sw01.md')).toContain('Back to [[UniFi Network]].');
    expect(await broken(api)).toEqual([]);
  });

  it('move: links to the document and from it are re-pointed', async () => {
    const { api, read } = await start();
    await post(api, '/documents/unifi/move', {
      folder: 'Infrastructure/Network',
      createFolders: true,
    });
    expect(await read('Applications/Home Assistant.md')).toContain(
      '[UniFi](../Infrastructure/Network/UniFi.md#vlans)',
    );
    const moved = await read('Infrastructure/Network/UniFi.md');
    expect(moved).toContain('[the switch](../../Network/sw01.md)');
    expect(moved).toContain('[procedure](../../Procedures/Backup.md)');
    expect(moved).toContain('![diagram](UniFi.assets/diagram.png)');
    expect(moved.startsWith('---\nid: unifi\ntitle: UniFi\n---\n')).toBe(true);
    expect(await broken(api)).toEqual([]);
  });

  it('folder move: links into, out of and within the folder keep working', async () => {
    const { api, content, read } = await start();
    await mkdir(path.join(content, 'Infrastructure'));
    await post(api, '/folders/move', { path: 'Network', targetFolder: 'Infrastructure' });
    expect(await read('Applications/Home Assistant.md')).toContain(
      '[UniFi](../Infrastructure/Network/UniFi.md#vlans)',
    );
    expect(await read('Applications/Home Assistant.md')).toContain(
      '[[Infrastructure/Network/UniFi]]',
    );
    const unifi = await read('Infrastructure/Network/UniFi.md');
    expect(unifi).toContain('[the switch](sw01.md)'); // within the folder: unchanged
    expect(unifi).toContain('[procedure](../../Procedures/Backup.md)'); // out of it: rebased
    expect(await broken(api)).toEqual([]);
  });

  it('folder rename updates links the same way', async () => {
    const { api, read } = await start();
    await post(api, '/folders/rename', { path: 'Network', name: 'Networking' });
    expect(await read('Applications/Home Assistant.md')).toContain(
      '[UniFi](../Networking/UniFi.md#vlans)',
    );
    expect(await broken(api)).toEqual([]);
  });
});
