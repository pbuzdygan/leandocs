import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { DocumentDto, IndexStatusResponse, SearchResponse } from '@leandocs/shared';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../config/config.js';
import { DocumentRegistry } from '../documents/registry.js';
import { MAX_ANALYSED_BYTES } from '../markdown/analysis.js';
import { ProcessAnalyser } from '../markdown/process-analyser.js';
import { buildApp } from '../test/authenticated-app.js';
import { makeTempDir } from '../test/temp-dir.js';

/** ADR-0025: documents too large or complex to parse are kept, listed and searchable. */

const apps: FastifyInstance[] = [];
const closers: (() => Promise<void>)[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  await Promise.all(closers.splice(0).map((close) => close()));
});

/** A body above the analysis limit, with a relative link a move would otherwise rewrite. */
function hugeBody(): string {
  const line = 'Plain words about the zebracorn appliance.\n';
  return `See [target](../Other/Target.md).\n\n${line.repeat(MAX_ANALYSED_BYTES / line.length + 10)}`;
}

async function start(root: string) {
  const app = await buildApp(loadConfig({ DATA_DIR: root, LOG_LEVEL: 'silent' }));
  apps.push(app);
  return app;
}

describe('documents beyond the analysis limits', () => {
  it('are shown as plain text, searchable, reported and remembered across restarts', async () => {
    const root = await makeTempDir();
    const content = path.join(root, 'content');
    await mkdir(path.join(content, 'Big'), { recursive: true });
    await writeFile(path.join(content, 'Big', 'Huge.md'), `---\nid: huge\n---\n${hugeBody()}`);
    await writeFile(path.join(content, 'Big', 'Small.md'), '---\nid: small\n---\n# Small\n');

    let app = await start(root);
    const document = (await app.inject('/api/v1/documents/huge')).json<DocumentDto>();
    expect(document.analysisLimited).toBe('larger than 2 MiB');
    expect((await app.inject('/api/v1/documents/small')).json<DocumentDto>()).not.toHaveProperty(
      'analysisLimited',
    );
    const search = (await app.inject('/api/v1/search?q=zebracorn')).json<SearchResponse>();
    expect(search.results.map((result) => result.id)).toEqual(['huge']);
    const issue = {
      code: 'TOO_COMPLEX',
      path: 'Big/Huge.md',
      message: expect.stringContaining('larger than 2 MiB'),
    };
    expect((await app.inject('/api/v1/index/status')).json<IndexStatusResponse>().issues).toEqual([
      issue,
    ]);

    // Unchanged files are not read again after a restart: the reason comes from the index.
    await app.close();
    apps.length = 0;
    app = await start(root);
    expect((await app.inject('/api/v1/index/status')).json<IndexStatusResponse>().issues).toEqual([
      issue,
    ]);
    expect((await app.inject('/api/v1/documents/huge')).json<DocumentDto>().analysisLimited).toBe(
      'larger than 2 MiB',
    );
  });

  it('keep their links when moved', async () => {
    const root = await makeTempDir();
    const content = path.join(root, 'content');
    await mkdir(path.join(content, 'Big'), { recursive: true });
    await mkdir(path.join(content, 'Other'), { recursive: true });
    await mkdir(path.join(content, 'Archive'), { recursive: true });
    const huge = `---\nid: huge\n---\n${hugeBody()}`;
    await writeFile(path.join(content, 'Big', 'Huge.md'), huge);
    await writeFile(
      path.join(content, 'Big', 'Small.md'),
      '---\nid: small\n---\nSee [target](../Other/Target.md).\n',
    );
    await writeFile(path.join(content, 'Other', 'Target.md'), '---\nid: target\n---\n# Target\n');
    const app = await start(root);

    const moved = await app.inject({
      method: 'POST',
      url: '/api/v1/folders/move',
      payload: { path: 'Big', targetFolder: 'Archive' },
    });
    expect(moved.statusCode, moved.body).toBe(200);
    expect(await readFile(path.join(content, 'Archive', 'Big', 'Small.md'), 'utf8')).toContain(
      '[target](../../Other/Target.md)',
    );
    expect(await readFile(path.join(content, 'Archive', 'Big', 'Huge.md'), 'utf8')).toBe(huge);
  });

  it('include crafted documents that take too long, without blocking other documents', async () => {
    const content = await makeTempDir();
    await writeFile(
      path.join(content, 'Crafted.md'),
      `${'*'.repeat(40_000)}x${'*'.repeat(40_000)}`,
    );
    await writeFile(path.join(content, 'Normal.md'), '# Normal\n\nSee [[Crafted]].\n');
    const analyser = new ProcessAnalyser({ timeoutMs: 3000, maxHeapMb: 256 });
    let calls = 0;
    const analyse = analyser.analyse.bind(analyser);
    analyser.analyse = (body) => (calls++, analyse(body));
    closers.push(() => analyser.close());
    const registry = new DocumentRegistry(content, {
      assignMissingIds: true,
      logger: { info: () => undefined, warn: () => undefined },
      analyser,
    });
    await registry.refresh();

    expect(registry.list().map((entry) => [entry.title, entry.analysisLimited])).toEqual([
      ['Crafted', 'too complex to read within 3 seconds'],
      ['Normal', undefined],
    ]);
    expect(registry.issues()).toEqual([
      expect.objectContaining({ code: 'TOO_COMPLEX', path: 'Crafted.md' }),
    ]);
    // Adding the missing ids rewrote the front matter only: each body was analysed once.
    expect(calls).toBe(2);
    expect(await readFile(path.join(content, 'Crafted.md'), 'utf8')).toMatch(/^---\nid: /);
  });
});
