import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { makeTempDir } from '../test/temp-dir.js';
import { atomicCreateFile, atomicWriteFile } from './atomic-write.js';

describe('atomicWriteFile', () => {
  it('creates and replaces files without leaving temp files', async () => {
    const dir = await makeTempDir();
    const target = path.join(dir, 'doc.md');
    await atomicWriteFile(target, 'one');
    await atomicWriteFile(target, 'two');
    expect(await readFile(target, 'utf8')).toBe('two');
    expect(await readdir(dir)).toEqual(['doc.md']);
  });

  it('leaves the target untouched and cleans up when the final step fails', async () => {
    const dir = await makeTempDir();
    // A directory at the target path makes the rename fail after the temp file was written.
    const target = path.join(dir, 'blocked');
    await mkdir(target);
    await writeFile(path.join(target, 'keep.txt'), 'keep');
    await expect(atomicWriteFile(target, 'data')).rejects.toThrow();
    expect(await readdir(dir)).toEqual(['blocked']);
    expect(await readFile(path.join(target, 'keep.txt'), 'utf8')).toBe('keep');
  });
});

describe('atomicCreateFile', () => {
  it('creates a new file', async () => {
    const dir = await makeTempDir();
    await atomicCreateFile(path.join(dir, 'new.md'), 'hello');
    expect(await readFile(path.join(dir, 'new.md'), 'utf8')).toBe('hello');
    expect(await readdir(dir)).toEqual(['new.md']);
  });

  it('never overwrites an existing file', async () => {
    const dir = await makeTempDir();
    const target = path.join(dir, 'existing.md');
    await writeFile(target, 'original');
    await expect(atomicCreateFile(target, 'replacement')).rejects.toMatchObject({ code: 'EEXIST' });
    expect(await readFile(target, 'utf8')).toBe('original');
    expect(await readdir(dir)).toEqual(['existing.md']);
  });
});
