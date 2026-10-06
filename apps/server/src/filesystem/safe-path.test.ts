import { mkdir, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { makeTempDir } from '../test/temp-dir.js';
import {
  UnsafePathError,
  normalizeRelativePath,
  resolveExistingDirectory,
  resolveInsideRoot,
  toRelativePath,
} from './safe-path.js';

describe('normalizeRelativePath', () => {
  it.each([
    ['', ''],
    ['.', ''],
    ['Infrastructure', 'Infrastructure'],
    ['Infrastructure/Servers', 'Infrastructure/Servers'],
    ['Infrastructure/Servers/', 'Infrastructure/Servers'],
    ['Home Assistant.md', 'Home Assistant.md'],
    ['Zażółć/Gęślą', 'Zażółć/Gęślą'],
  ])('accepts %j', (input, expected) => {
    expect(normalizeRelativePath(input)).toBe(expected);
  });

  it.each([
    '..',
    '../etc/passwd',
    'a/../../b',
    'a/./b',
    'a//b',
    '/etc/passwd',
    'C:/Windows',
    'c:\\Windows',
    'a\\..\\b',
    'a\0b',
  ])('rejects %j', (input) => {
    expect(() => normalizeRelativePath(input)).toThrow(UnsafePathError);
  });

  it('rejects non-strings', () => {
    expect(() => normalizeRelativePath(42 as unknown as string)).toThrow(UnsafePathError);
  });
});

describe('resolveInsideRoot', () => {
  it('resolves inside the root', () => {
    expect(resolveInsideRoot('/data/content', 'a/b.md')).toBe(path.resolve('/data/content/a/b.md'));
    expect(resolveInsideRoot('/data/content', '')).toBe(path.resolve('/data/content'));
  });

  it('rejects traversal', () => {
    expect(() => resolveInsideRoot('/data/content', '../system/app.db')).toThrow(UnsafePathError);
  });

  it('round-trips with toRelativePath', () => {
    const root = path.resolve('/data/content');
    expect(toRelativePath(root, resolveInsideRoot(root, 'Network/VLAN.md'))).toBe(
      'Network/VLAN.md',
    );
  });
});

describe('resolveExistingDirectory', () => {
  it('returns existing directories', async () => {
    const root = await makeTempDir();
    await mkdir(path.join(root, 'Network'));
    await expect(resolveExistingDirectory(root, 'Network')).resolves.toBe(
      path.join(root, 'Network'),
    );
    await expect(resolveExistingDirectory(root, '')).resolves.toBe(path.resolve(root));
  });

  it('reports missing folders and files as FOLDER_NOT_FOUND', async () => {
    const root = await makeTempDir();
    await writeFile(path.join(root, 'file.md'), '# x');
    await expect(resolveExistingDirectory(root, 'missing')).rejects.toMatchObject({
      code: 'FOLDER_NOT_FOUND',
      statusCode: 404,
    });
    await expect(resolveExistingDirectory(root, 'file.md')).rejects.toMatchObject({
      code: 'FOLDER_NOT_FOUND',
    });
  });

  it('rejects symlinks that escape the root', async () => {
    const outside = await makeTempDir('leandocs-outside-');
    const root = await makeTempDir();
    await symlink(outside, path.join(root, 'escape'));
    await expect(resolveExistingDirectory(root, 'escape')).rejects.toBeInstanceOf(UnsafePathError);
  });
});
