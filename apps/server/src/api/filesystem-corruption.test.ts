import { chmod, mkdir, readFile, readdir, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  DocumentDto,
  IndexStatusResponse,
  ScanIssue,
  TrashResponse,
  TreeNode,
  TreeResponse,
} from '@leandocs/shared';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../config/config.js';
import { buildApp } from '../test/authenticated-app.js';
import { makeTempDir } from '../test/temp-dir.js';

/**
 * P15-03: a damaged or unusual content folder never stops LeanDocs, never hides healthy documents
 * and is never "repaired" by changing bytes the user wrote. Every scenario uses a real directory.
 */

const apps: FastifyInstance[] = [];
const restore: (() => Promise<void>)[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  // Give permissions back so the temporary directory can be removed.
  await Promise.all(restore.splice(0).map((undo) => undo()));
});

/** Permission tests are meaningless for root, which can read anything. */
const isRoot = process.getuid?.() === 0;

const HEALTHY = '---\nid: healthy\ntitle: Healthy\n---\n# Healthy\n\nStill here.\n';
/** "# Zródło" in Windows-1250: 0xF3 (ó) and 0xB3 (ł) are not valid UTF-8. */
const WINDOWS_1250 = Buffer.from([
  0x23, 0x20, 0x5a, 0x72, 0xf3, 0x64, 0xb3, 0x6f, 0x0a, 0x0a, 0x5b, 0x74, 0x5d, 0x28, 0x54, 0x61,
  0x72, 0x67, 0x65, 0x74, 0x2e, 0x6d, 0x64, 0x29, 0x20, 0x5b, 0x5b, 0x54, 0x61, 0x72, 0x67, 0x65,
  0x74, 0x5d, 0x5d, 0x0a,
]); // "# Zródło\n\n[t](Target.md) [[Target]]\n"

async function setup(): Promise<{ root: string; content: string }> {
  const root = await makeTempDir();
  const content = path.join(root, 'content');
  await mkdir(content, { recursive: true });
  await writeFile(path.join(content, 'Healthy.md'), HEALTHY);
  return { root, content };
}

async function start(root: string): Promise<FastifyInstance> {
  const app = await buildApp(loadConfig({ DATA_DIR: root, LOG_LEVEL: 'silent' }));
  apps.push(app);
  return app;
}

async function issues(app: FastifyInstance): Promise<ScanIssue[]> {
  return (await app.inject('/api/v1/index/status')).json<IndexStatusResponse>().issues;
}

async function documentPaths(app: FastifyInstance): Promise<string[]> {
  const paths: string[] = [];
  const visit = (node: TreeNode) => {
    if (node.type === 'document') paths.push(node.path);
    else node.children.forEach(visit);
  };
  visit((await app.inject('/api/v1/tree')).json<TreeResponse>().root);
  return paths.sort();
}

async function idOf(app: FastifyInstance, relativePath: string): Promise<string> {
  let id: string | undefined;
  const visit = (node: TreeNode) => {
    if (node.type === 'document' && node.path === relativePath) id = node.id;
    else if (node.type === 'folder') node.children.forEach(visit);
  };
  visit((await app.inject('/api/v1/tree')).json<TreeResponse>().root);
  if (!id) throw new Error(`${relativePath} is not listed`);
  return id;
}

async function expectHealthy(app: FastifyInstance): Promise<void> {
  const document = (await app.inject('/api/v1/documents/healthy')).json<DocumentDto>();
  expect(document.content).toContain('Still here.');
}

describe('files that are not UTF-8', () => {
  it('are listed and searchable but never written, so no byte is lost', async () => {
    const { root, content } = await setup();
    const latin = path.join(content, 'Latin.md');
    await writeFile(latin, WINDOWS_1250);
    await writeFile(path.join(content, 'Target.md'), '---\nid: target\n---\n# Target\n');
    // A UTF-16 file (with its byte order mark) is not UTF-8 either.
    const utf16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('# Wide\n', 'utf16le')]);
    await writeFile(path.join(content, 'Wide.md'), utf16);

    let app = await start(root);
    // Startup did not add an id (that would have re-encoded the file).
    expect(await readFile(latin)).toEqual(WINDOWS_1250);
    expect(await readFile(path.join(content, 'Wide.md'))).toEqual(utf16);
    const id = await idOf(app, 'Latin.md');
    expect(id).toMatch(/^p-/);
    const document = (await app.inject(`/api/v1/documents/${id}`)).json<DocumentDto>();
    expect(document.notUtf8).toBe(true);
    expect(document.title).toBe('Zr�d�o');
    expect((await app.inject('/api/v1/documents/healthy')).json<DocumentDto>()).not.toHaveProperty(
      'notUtf8',
    );
    const notUtf8 = (await issues(app)).filter((issue) => issue.code === 'NOT_UTF8');
    expect(notUtf8.map((issue) => issue.path)).toEqual(['Latin.md', 'Wide.md']);

    // Every write that would re-encode the file is refused.
    const writes = [
      {
        method: 'PUT' as const,
        url: `/api/v1/documents/${id}`,
        payload: { content: 'replaced', expectedRevision: document.revision },
      },
      {
        method: 'POST' as const,
        url: `/api/v1/documents/${id}/properties`,
        payload: { expectedRevision: document.revision, tags: ['x'] },
      },
      {
        method: 'POST' as const,
        url: `/api/v1/documents/${id}/rename`,
        payload: { name: 'Renamed', title: 'Renamed' },
      },
    ];
    for (const write of writes) {
      const response = await app.inject(write);
      expect(response.statusCode, write.url).toBe(422);
      expect(response.json<{ error: { code: string } }>().error.code).toBe('NOT_UTF8');
    }
    expect(await readFile(latin)).toEqual(WINDOWS_1250);

    // Retitling and moving the document it links to does not rewrite its links either.
    const target = (await app.inject('/api/v1/documents/target')).json<DocumentDto>();
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/documents/target/properties',
          payload: { expectedRevision: target.revision, title: 'Goal' },
        })
      ).statusCode,
    ).toBe(200);
    await mkdir(path.join(content, 'Sub'));
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/documents/target/move',
          payload: { folder: 'Sub' },
        })
      ).statusCode,
    ).toBe(200);
    expect(await readFile(latin)).toEqual(WINDOWS_1250);

    // Renaming or moving the file itself keeps its bytes.
    const renamed = await app.inject({
      method: 'POST',
      url: `/api/v1/documents/${id}/rename`,
      payload: { name: 'Legacy' },
    });
    expect(renamed.statusCode).toBe(200);
    expect(await readFile(path.join(content, 'Legacy.md'))).toEqual(WINDOWS_1250);

    // The index remembers the problem: unchanged files are not read again after a restart.
    await app.close();
    apps.length = 0;
    app = await start(root);
    expect(
      (await issues(app)).filter((issue) => issue.code === 'NOT_UTF8').map((issue) => issue.path),
    ).toEqual(['Legacy.md', 'Wide.md']);
    expect(await readFile(path.join(content, 'Legacy.md'))).toEqual(WINDOWS_1250);

    // Once converted to UTF-8 it is an ordinary document and gets its id.
    await writeFile(path.join(content, 'Legacy.md'), '# Zródło\n');
    await app.inject({ method: 'POST', url: '/api/v1/index/rebuild' });
    // The rebuild runs in the background; under a full parallel test run it can take over 1 s.
    await expect
      .poll(async () => (await issues(app)).map((issue) => issue.path), { timeout: 10_000 })
      .toEqual(['Wide.md']);
    expect(await readFile(path.join(content, 'Legacy.md'), 'utf8')).toMatch(/^---\nid: /);
  });
});

describe.skipIf(isRoot)('unreadable files and folders', () => {
  it('a folder without read permission is reported; the rest of the library works', async () => {
    const { root, content } = await setup();
    const locked = path.join(content, 'Locked');
    await mkdir(path.join(locked, 'Deeper'), { recursive: true });
    await writeFile(path.join(locked, 'Inside.md'), '---\nid: inside\n---\n# Inside\n');
    await chmod(locked, 0o000);
    restore.push(() => chmod(locked, 0o755));

    const app = await start(root);
    expect(await documentPaths(app)).toEqual(['Healthy.md']);
    await expectHealthy(app);
    expect(await issues(app)).toEqual([
      {
        code: 'UNREADABLE_FOLDER',
        path: 'Locked',
        message: expect.stringContaining('not allowed'),
      },
    ]);

    await chmod(locked, 0o755);
    await app.inject({ method: 'POST', url: '/api/v1/index/rebuild' });
    await expect.poll(() => documentPaths(app)).toEqual(['Healthy.md', 'Locked/Inside.md']);
    expect(await issues(app)).toEqual([]);
  });

  it('a file without read permission is reported and left alone', async () => {
    const { root, content } = await setup();
    const locked = path.join(content, 'Secret.md');
    await writeFile(locked, '# Secret\n');
    await chmod(locked, 0o000);
    restore.push(() => chmod(locked, 0o644));

    const app = await start(root);
    await expectHealthy(app);
    expect(await issues(app)).toEqual([
      { code: 'UNREADABLE', path: 'Secret.md', message: expect.stringContaining('EACCES') },
    ]);
    await chmod(locked, 0o644);
    expect(await readFile(locked, 'utf8')).toBe('# Secret\n');
  });
});

describe('damaged front matter', () => {
  const cases: Record<string, string> = {
    'Unclosed.md': '---\nid: unclosed\ntitle: Never closed\n# Body\n',
    'Not a map.md': '---\n- just\n- a list\n---\n# Body\n',
    'Bad yaml.md': '---\nid: [unbalanced\n---\n# Body\n',
    'Tabs.md': '---\n\tid: tabbed\n---\n# Body\n',
    // Exponential alias expansion ("billion laughs") must not exhaust memory or hide the file.
    'Aliases.md': `---\na: &a [x,x,x,x,x,x,x,x,x]\nb: &b [*a,*a,*a,*a,*a,*a,*a,*a,*a]\nc: &c [*b,*b,*b,*b,*b,*b,*b,*b,*b]\nd: &d [*c,*c,*c,*c,*c,*c,*c,*c,*c]\ne: [*d,*d,*d,*d,*d,*d,*d,*d,*d]\n---\n# Body\n`,
    'Wrong types.md': '---\nid: 5\ntitle: {a: 1}\ntags: {x: 1}\naliases: [[1]]\n---\n# Typed\n',
  };

  it('keeps every such file listed, readable and byte-for-byte unchanged', async () => {
    const { root, content } = await setup();
    for (const [name, source] of Object.entries(cases))
      await writeFile(path.join(content, name), source);

    const app = await start(root);
    expect(await documentPaths(app)).toEqual(
      [...Object.keys(cases), 'Healthy.md', 'Unclosed.md']
        .filter((name, index, all) => all.indexOf(name) === index)
        .sort(),
    );
    for (const [name, source] of Object.entries(cases)) {
      // An unclosed fence is just text, so it gets an id like any document without front matter.
      if (name === 'Unclosed.md') continue;
      expect(await readFile(path.join(content, name), 'utf8'), name).toBe(source);
      const id = await idOf(app, name);
      const response = await app.inject(`/api/v1/documents/${id}`);
      expect(response.statusCode, name).toBe(200);
    }
    const byPath = new Map((await issues(app)).map((issue) => [issue.path, issue.code]));
    expect(Object.fromEntries(byPath)).toEqual({
      'Aliases.md': 'FRONTMATTER_INVALID',
      'Bad yaml.md': 'FRONTMATTER_INVALID',
      'Not a map.md': 'FRONTMATTER_INVALID',
      'Tabs.md': 'FRONTMATTER_INVALID',
      'Wrong types.md': 'INVALID_ID',
    });
    expect(
      (
        await app.inject(`/api/v1/documents/${await idOf(app, 'Wrong types.md')}`)
      ).json<DocumentDto>().title,
    ).toBe('Typed');
  });
});

describe('unusual entries in the content folder', () => {
  it('ignores leftovers, links and non-documents without failing', async () => {
    const { root, content } = await setup();
    // An interrupted atomic save and editor swap files are hidden dot-files.
    await writeFile(path.join(content, '.Healthy.md.0a1b2c3d4e5f.tmp'), '---\nid: healthy\n---\n');
    await writeFile(path.join(content, '.Healthy.md.swp'), 'swap');
    // A folder that happens to end in `.md` is a folder, not a document.
    await mkdir(path.join(content, 'Notes.md'));
    await writeFile(path.join(content, 'Notes.md', 'Real.md'), '# Real\n');
    // Links are never followed, wherever they point.
    const outside = await makeTempDir();
    await writeFile(path.join(outside, 'Outside.md'), '# Outside\n');
    await symlink(path.join(outside, 'Outside.md'), path.join(content, 'Link.md'));
    await symlink(outside, path.join(content, 'Linked folder'));
    await symlink(path.join(content, 'missing.md'), path.join(content, 'Dangling.md'));
    // Empty files and files with control bytes are still documents.
    await writeFile(path.join(content, 'Empty.md'), '');
    await writeFile(path.join(content, 'Control.md'), Buffer.from([0x00, 0x01, 0x07, 0x0a]));

    const app = await start(root);
    expect(await documentPaths(app)).toEqual([
      'Control.md',
      'Empty.md',
      'Healthy.md',
      'Notes.md/Real.md',
    ]);
    await expectHealthy(app);
    expect(await issues(app)).toEqual([]);
    expect(await readFile(path.join(outside, 'Outside.md'), 'utf8')).toBe('# Outside\n');
    // The leftover temp file was not treated as a second copy of the document.
    expect(await readFile(path.join(content, '.Healthy.md.0a1b2c3d4e5f.tmp'), 'utf8')).toBe(
      '---\nid: healthy\n---\n',
    );
  });

  it('reports names that are not UTF-8 instead of dropping them silently', async () => {
    const { root, content } = await setup();
    const bad = Buffer.concat([
      Buffer.from(`${content}/Caf`),
      Buffer.from([0xe9]),
      Buffer.from('.md'),
    ]);
    await writeFile(bad, '# Café\n');
    const badFolder = Buffer.concat([Buffer.from(`${content}/Dir`), Buffer.from([0xff])]);
    await mkdir(badFolder);

    const app = await start(root);
    expect(await documentPaths(app)).toEqual(['Healthy.md']);
    expect((await issues(app)).map(({ code, path }) => ({ code, path }))).toEqual([
      { code: 'INVALID_FILE_NAME', path: 'Caf�.md' },
      { code: 'INVALID_FILE_NAME', path: 'Dir�' },
    ]);
    expect(await readFile(bad, 'utf8')).toBe('# Café\n');
  });

  it('answers 404, not an error, when a document is replaced by a folder', async () => {
    const { root, content } = await setup();
    await writeFile(path.join(content, 'Shape.md'), '---\nid: shape\n---\n# Shape\n');
    const app = await start(root);
    expect((await app.inject('/api/v1/documents/shape')).statusCode).toBe(200);

    const { rm } = await import('node:fs/promises');
    await rm(path.join(content, 'Shape.md'));
    await mkdir(path.join(content, 'Shape.md'));
    expect((await app.inject('/api/v1/documents/shape')).statusCode).toBe(404);
    expect(await documentPaths(app)).toEqual(['Healthy.md']);
  });

  it('keeps working when the whole content folder disappears and comes back', async () => {
    const { root, content } = await setup();
    const app = await start(root);
    const { rename } = await import('node:fs/promises');
    await rename(content, `${content}.away`);
    expect((await app.inject('/api/v1/documents/healthy')).statusCode).toBe(404);
    await rename(`${content}.away`, content);
    await expectHealthy(app);
  });
});

describe('damaged trash', () => {
  it('lists intact items and leaves damaged ones on disk', async () => {
    const { root, content } = await setup();
    const trash = path.join(content, '_trash');
    const item = (name: string) => path.join(trash, name);
    await mkdir(item('20261001T120000Z-0000000a'), { recursive: true });
    await writeFile(
      path.join(item('20261001T120000Z-0000000a'), '.leandocs-trash.json'),
      '{ "vers',
    );
    await mkdir(item('20261001T120000Z-0000000b'));
    await writeFile(path.join(item('20261001T120000Z-0000000b'), 'Orphan.md'), '# Orphan\n');
    await mkdir(item('20261001T120000Z-0000000c'));
    await writeFile(
      path.join(item('20261001T120000Z-0000000c'), '.leandocs-trash.json'),
      JSON.stringify({
        version: 1,
        kind: 'document',
        name: '../escape.md',
        originalPath: 'x.md',
        deletedAt: 'x',
      }),
    );

    const app = await start(root);
    const trashed = await app.inject({ method: 'DELETE', url: '/api/v1/documents/healthy' });
    expect(trashed.statusCode).toBe(200);
    const list = (await app.inject('/api/v1/trash')).json<TrashResponse>();
    expect(list.items.map((entry) => entry.name)).toEqual(['Healthy.md']);
    for (const damaged of ['0000000a', '0000000b', '0000000c'])
      expect(
        (
          await app.inject({
            method: 'POST',
            url: `/api/v1/trash/20261001T120000Z-${damaged}/restore`,
          })
        ).statusCode,
      ).toBe(404);

    expect((await app.inject({ method: 'DELETE', url: '/api/v1/trash' })).statusCode).toBe(200);
    // Emptying the trash removes what it can identify; damaged items stay for the user to inspect.
    expect((await readdir(trash)).sort()).toEqual([
      '20261001T120000Z-0000000a',
      '20261001T120000Z-0000000b',
      '20261001T120000Z-0000000c',
    ]);
    expect(await readFile(path.join(item('20261001T120000Z-0000000b'), 'Orphan.md'), 'utf8')).toBe(
      '# Orphan\n',
    );
  });
});
