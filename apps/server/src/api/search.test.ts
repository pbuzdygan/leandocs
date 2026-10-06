import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { SearchResponse } from '@leandocs/shared';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../test/authenticated-app.js';
import { loadConfig } from '../config/config.js';
import { makeTempDir } from '../test/temp-dir.js';

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

let counter = 0;
function doc(title: string, body: string, extra: string[] = []): string {
  counter += 1;
  const id = `doc-${counter}`;
  return ['---', `id: ${id}`, `title: ${JSON.stringify(title)}`, ...extra, '---', body, ''].join(
    '\n',
  );
}

async function start(files: Record<string, string>): Promise<FastifyInstance> {
  const dataDir = await makeTempDir();
  for (const [relative, content] of Object.entries(files)) {
    const file = path.join(dataDir, 'content', relative);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, content);
  }
  app = await buildApp(loadConfig({ LOG_LEVEL: 'silent', DATA_DIR: dataDir }));
  return app;
}

async function search(instance: FastifyInstance, q: string, limit?: number) {
  const res = await instance.inject({
    method: 'GET',
    url: '/api/v1/search',
    query: limit ? { q, limit: String(limit) } : { q },
  });
  expect(res.statusCode).toBe(200);
  return res.json<SearchResponse>();
}

const titles = (response: SearchResponse) => response.results.map((result) => result.title);

describe('GET /api/v1/search', () => {
  it('ranks exact title, title prefix, title words, alias, tag, heading, then body (§32)', async () => {
    const instance = await start({
      'a.md': doc('Notes', 'Plain text that mentions docker once.'),
      'b.md': doc('Hosts', '## Docker setup\n\nsteps'),
      'c.md': doc('Server', 'body', ['tags: [docker]']),
      'd.md': doc('Engine', 'body', ['aliases: [docker engine]']),
      'e.md': doc('Running docker hosts', 'body'),
      'f.md': doc('Docker Compose', 'body'),
      'g.md': doc('Docker', 'body'),
    });
    const response = await search(instance, 'docker');
    expect(titles(response)).toEqual([
      'Docker',
      'Docker Compose',
      'Running docker hosts',
      'Engine',
      'Server',
      'Hosts',
      'Notes',
    ]);
    expect(response.results.map((result) => result.match)).toEqual([
      'title',
      'title-prefix',
      'title-words',
      'alias',
      'tag',
      'heading',
      'content',
    ]);
  });

  it('returns a plain-text snippet with the matched words marked', async () => {
    const instance = await start({
      'Home Assistant.md': doc(
        'Home Assistant',
        'Intro paragraph.\n\nThe macvlan-shim is used for host communication <script>x</script>.',
      ),
    });
    const [result] = (await search(instance, 'macvlan')).results;
    expect(result).toMatchObject({ title: 'Home Assistant', path: 'Home Assistant.md' });
    expect(result!.snippet.filter((part) => part.match)).toEqual([
      { text: 'macvlan', match: true },
    ]);
    const text = result!.snippet.map((part) => part.text).join('');
    expect(text).toContain('macvlan-shim is used');
    expect(text).not.toContain('\u0002');
    expect(text).not.toContain('\u0003');
    // Raw HTML is indexed as text only; the snippet never carries markup.
    expect(text).not.toContain('<script>');
  });

  it('matches word prefixes, all words (AND) and phrases', async () => {
    const instance = await start({
      'one.md': doc('One', 'nginx proxy manager in front of the stack'),
      'two.md': doc('Two', 'proxy only'),
    });
    expect(titles(await search(instance, 'ngi'))).toEqual(['One']);
    expect(titles(await search(instance, 'proxy nginx'))).toEqual(['One']);
    expect(titles(await search(instance, '"proxy manager"'))).toEqual(['One']);
    expect(titles(await search(instance, '"manager proxy"'))).toEqual([]);
  });

  it('applies tag:, path: and title: filters (§33)', async () => {
    const instance = await start({
      'Infrastructure/Servers/BUZHULK.md': doc('BUZHULK', 'docker host', ['tags: [server]']),
      'Infrastructure/Network/UniFi.md': doc('UniFi', 'docker controller', ['tags: [network]']),
      'Applications/Vaultwarden.md': doc('Vaultwarden', 'docker app', ['tags: [server]']),
    });
    expect(titles(await search(instance, 'docker tag:server')).sort()).toEqual([
      'BUZHULK',
      'Vaultwarden',
    ]);
    expect(titles(await search(instance, 'docker path:Infrastructure')).sort()).toEqual([
      'BUZHULK',
      'UniFi',
    ]);
    expect(titles(await search(instance, 'docker path:network'))).toEqual(['UniFi']);
    expect(titles(await search(instance, 'title:buz'))).toEqual(['BUZHULK']);
    // Filter-only queries list matching documents by title.
    expect(titles(await search(instance, 'tag:server'))).toEqual(['BUZHULK', 'Vaultwarden']);
    expect(titles(await search(instance, 'tag:server path:Applications'))).toEqual(['Vaultwarden']);
  });

  it('folds Polish letters, including ł (KI-6)', async () => {
    const instance = await start({
      'zasilanie.md': doc('Źródło zasilania', 'Zapasowa część UPS.'),
    });
    for (const q of ['zrodlo', 'źródło', 'ZRÓDŁO', 'czesc', 'zasil'])
      expect(titles(await search(instance, q)), q).toEqual(['Źródło zasilania']);
    expect((await search(instance, 'zrodlo')).results[0]?.match).toBe('title-prefix');
  });

  it('never fails on FTS5 syntax in user input', async () => {
    const instance = await start({ 'a.md': doc('Alpha', 'alpha beta') });
    for (const q of [
      '"',
      '*',
      'NEAR(alpha beta)',
      'alpha OR',
      'title:',
      ')',
      '-alpha',
      'a^b',
      '"""',
    ])
      await search(instance, q);
    expect(titles(await search(instance, 'alpha*'))).toEqual(['Alpha']);
  });

  it('reflects document changes immediately (Phase 8 acceptance)', async () => {
    const instance = await start({ 'note.md': doc('Note', 'zebra') });
    expect(titles(await search(instance, 'zebra'))).toEqual(['Note']);
    const current = await instance.inject({
      method: 'GET',
      url: '/api/v1/documents/doc-' + counter,
    });
    const res = await instance.inject({
      method: 'PUT',
      url: `/api/v1/documents/doc-${counter}`,
      payload: {
        content: 'giraffe\n',
        expectedRevision: current.json<{ revision: string }>().revision,
      },
    });
    expect(res.statusCode).toBe(200);
    expect(titles(await search(instance, 'zebra'))).toEqual([]);
    expect(titles(await search(instance, 'giraffe'))).toEqual(['Note']);
  });

  it('validates input and honours the limit', async () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 30; i++) files[`d${i}.md`] = doc(`Doc ${i}`, 'common word');
    const instance = await start(files);
    expect((await search(instance, 'common')).results).toHaveLength(20);
    expect((await search(instance, 'common', 5)).results).toHaveLength(5);
    expect((await search(instance, '   ')).results).toEqual([]);
    const missing = await instance.inject({ method: 'GET', url: '/api/v1/search' });
    expect(missing.statusCode).toBe(400);
    const tooMany = await instance.inject({ method: 'GET', url: '/api/v1/search?q=a&limit=500' });
    expect(tooMany.statusCode).toBe(400);
  });
});
