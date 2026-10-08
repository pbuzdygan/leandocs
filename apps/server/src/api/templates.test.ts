import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { DocumentDto, TemplatesResponse, TreeResponse } from '@leandocs/shared';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../test/authenticated-app.js';
import { loadConfig } from '../config/config.js';
import { makeTempDir } from '../test/temp-dir.js';

/** P10-01, P10-02 (PROJECT_SPEC §35–37). */

const apps: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

async function start(dataDir: string): Promise<FastifyInstance> {
  const app = await buildApp(loadConfig({ LOG_LEVEL: 'silent', DATA_DIR: dataDir }));
  apps.push(app);
  return app;
}

async function templates(app: FastifyInstance): Promise<string[]> {
  const res = await app.inject({ method: 'GET', url: '/api/v1/templates' });
  return res.json<TemplatesResponse>().items.map((item) => item.name);
}

function create(app: FastifyInstance, payload: object) {
  return app.inject({ method: 'POST', url: '/api/v1/documents', payload });
}

describe('templates', () => {
  it('seeds the built-in templates once, hidden from the tree', async () => {
    const dataDir = await makeTempDir();
    const app = await start(dataDir);
    expect(await templates(app)).toEqual([
      'Application',
      'Incident',
      'Network Device',
      'Procedure',
      'Server',
    ]);
    const tree = (await app.inject({ method: 'GET', url: '/api/v1/tree' })).json<TreeResponse>();
    expect(tree.root.children).toEqual([]);

    // A deleted template stays deleted; an edited one is not overwritten.
    const folder = path.join(dataDir, 'content', '_templates');
    await rm(path.join(folder, 'Incident.md'));
    await writeFile(path.join(folder, 'Server.md'), '# My server {{title}}\n');
    await app.close();
    apps.splice(apps.indexOf(app), 1);
    const again = await start(dataDir);
    expect(await templates(again)).not.toContain('Incident');
    expect(await readFile(path.join(folder, 'Server.md'), 'utf8')).toBe('# My server {{title}}\n');
  });

  it('leaves an existing _templates folder alone', async () => {
    const dataDir = await makeTempDir();
    await mkdir(path.join(dataDir, 'content', '_templates'), { recursive: true });
    await writeFile(path.join(dataDir, 'content', '_templates', 'Mine.md'), 'mine\n');
    const app = await start(dataDir);
    expect(await templates(app)).toEqual(['Mine']);
  });

  it('creates documents from a template with placeholders and template front matter', async () => {
    const dataDir = await makeTempDir();
    const app = await start(dataDir);
    const res = await create(app, { name: 'BUZHULK', template: 'Server' });
    expect(res.statusCode).toBe(201);
    const doc = res.json<DocumentDto>();
    expect(doc.content.startsWith('# BUZHULK\n\n## Overview\n')).toBe(true);
    expect(doc.frontmatter).toMatchObject({ id: doc.id, title: 'BUZHULK', tags: ['server'] });
    const file = await readFile(path.join(dataDir, 'content', 'BUZHULK.md'), 'utf8');
    expect(file).toMatch(
      /^---\nid: [0-9a-f-]{36}\ntitle: BUZHULK\ncreated: .+\nupdated: .+\ntags:\n {2}- server\n---\n\n# BUZHULK\n/,
    );

    const incident = (
      await create(app, { name: 'Outage', template: 'Incident' })
    ).json<DocumentDto>();
    expect(incident.content).toContain(`**Date:** ${new Date().toISOString().slice(0, 10)}`);
  });

  it('uses template front matter values but never its id or dates', async () => {
    const dataDir = await makeTempDir();
    const app = await start(dataDir);
    const folder = path.join(dataDir, 'content', '_templates');
    await writeFile(
      path.join(folder, 'Custom.md'),
      '---\nid: fixed\ntitle: Template title\ncreated: 2000-01-01\ndescription: About {{title}}\nowner: ops\n---\nBody for {{title}}.\n',
    );
    const doc = (await create(app, { name: 'Thing', template: 'Custom' })).json<DocumentDto>();
    expect(doc.id).not.toBe('fixed');
    expect(doc.frontmatter).toMatchObject({
      title: 'Thing',
      description: 'About Thing',
      owner: 'ops',
    });
    expect(doc.frontmatter.created).not.toBe('2000-01-01');
    expect(doc.content).toBe('Body for Thing.\n');
    expect(await readdir(path.join(dataDir, 'content'))).toContain('Thing.md');
  });

  it('rejects unknown templates, unsafe names and template + content', async () => {
    const app = await start(await makeTempDir());
    expect((await create(app, { name: 'A', template: 'Missing' })).statusCode).toBe(404);
    expect((await create(app, { name: 'B', template: '../secret' })).statusCode).toBe(400);
    const both = await create(app, { name: 'C', template: 'Server', content: 'x' });
    expect(both.statusCode).toBe(400);
  });
});
