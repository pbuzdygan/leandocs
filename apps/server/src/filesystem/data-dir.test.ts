import { chmod, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { makeTempDir } from '../test/temp-dir.js';
import { DataDirError, ensureDataDirs } from './data-dir.js';

describe('ensureDataDirs', () => {
  it('creates content and system directories', async () => {
    const dataDir = path.join(await makeTempDir(), 'data');
    const dirs = await ensureDataDirs(dataDir);
    expect(dirs).toEqual({
      contentDir: path.join(dataDir, 'content'),
      systemDir: path.join(dataDir, 'system'),
    });
    expect((await stat(dirs.contentDir)).isDirectory()).toBe(true);
    expect((await stat(dirs.systemDir)).isDirectory()).toBe(true);
  });

  it('is idempotent', async () => {
    const dataDir = await makeTempDir();
    await ensureDataDirs(dataDir);
    await expect(ensureDataDirs(dataDir)).resolves.toBeDefined();
  });

  it('fails with a clear error when the data dir is a file', async () => {
    const dataDir = path.join(await makeTempDir(), 'not-a-dir');
    await writeFile(dataDir, 'x');
    await expect(ensureDataDirs(dataDir)).rejects.toBeInstanceOf(DataDirError);
  });

  it.skipIf(process.getuid?.() === 0)('fails when the directory is not writable', async () => {
    const dataDir = await makeTempDir();
    await chmod(dataDir, 0o500);
    try {
      await expect(ensureDataDirs(dataDir)).rejects.toThrow(/not usable/);
    } finally {
      await chmod(dataDir, 0o700);
    }
  });
});
