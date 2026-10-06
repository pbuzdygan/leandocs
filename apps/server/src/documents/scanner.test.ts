import { mkdir, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { makeTempDir } from '../test/temp-dir.js';
import { scanContent } from './scanner.js';

async function put(root: string, relative: string, content = '# x\n'): Promise<void> {
  await mkdir(path.dirname(path.join(root, relative)), { recursive: true });
  await writeFile(path.join(root, relative), content);
}

describe('scanContent', () => {
  it('returns nothing for an empty directory', async () => {
    expect(await scanContent(await makeTempDir())).toEqual({ folders: [], files: [] });
  });

  it('finds nested folders and Markdown documents only', async () => {
    const root = await makeTempDir();
    await put(root, 'Infrastructure/Servers/BUZHULK.md');
    await put(root, 'Network/VLAN.md');
    await put(root, 'Network/diagram.png');
    await put(root, 'README.MD');
    await mkdir(path.join(root, 'Empty'));
    const result = await scanContent(root);
    expect(result.folders).toEqual([
      'Empty',
      'Infrastructure',
      'Infrastructure/Servers',
      'Network',
    ]);
    expect(result.files.map((file) => file.path)).toEqual([
      'Infrastructure/Servers/BUZHULK.md',
      'Network/VLAN.md',
      'README.MD',
    ]);
  });

  it('hides dot-entries, root system folders and assets folders', async () => {
    const root = await makeTempDir();
    await put(root, '.git/HEAD.md');
    await put(root, '.hidden.md');
    await put(root, '_trash/Old.md');
    await put(root, '_templates/Server.md');
    await put(root, 'Docs/_drafts/Visible.md');
    await put(root, 'Docs/BUZHULK.md');
    await put(root, 'Docs/BUZHULK.assets/notes.md');
    const result = await scanContent(root);
    expect(result.folders).toEqual(['Docs', 'Docs/_drafts']);
    expect(result.files.map((file) => file.path)).toEqual([
      'Docs/BUZHULK.md',
      'Docs/_drafts/Visible.md',
    ]);
  });

  it('does not follow symlinks', async () => {
    const outside = await makeTempDir('leandocs-outside-');
    await put(outside, 'Secret.md');
    const root = await makeTempDir();
    await symlink(outside, path.join(root, 'linked'));
    await symlink(path.join(outside, 'Secret.md'), path.join(root, 'Secret.md'));
    expect(await scanContent(root)).toEqual({ folders: [], files: [] });
  });
});
