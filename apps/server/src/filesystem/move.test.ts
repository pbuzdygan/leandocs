import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { makeTempDir } from '../test/temp-dir.js';
import { MutationLock } from './lock.js';
import { moveNoOverwrite, pathExists } from './move.js';

describe('moveNoOverwrite', () => {
  it('moves files and directories', async () => {
    const dir = await makeTempDir();
    await writeFile(path.join(dir, 'a.md'), 'A');
    await mkdir(path.join(dir, 'a.assets'));
    await writeFile(path.join(dir, 'a.assets', 'img.png'), 'png');
    await mkdir(path.join(dir, 'Target'));

    await moveNoOverwrite(path.join(dir, 'a.md'), path.join(dir, 'Target', 'b.md'));
    await moveNoOverwrite(path.join(dir, 'a.assets'), path.join(dir, 'Target', 'b.assets'));

    expect(await readFile(path.join(dir, 'Target', 'b.md'), 'utf8')).toBe('A');
    expect(await readdir(path.join(dir, 'Target', 'b.assets'))).toEqual(['img.png']);
    expect(await pathExists(path.join(dir, 'a.md'))).toBe(false);
  });

  it('refuses to overwrite files or directories', async () => {
    const dir = await makeTempDir();
    await writeFile(path.join(dir, 'a.md'), 'A');
    await writeFile(path.join(dir, 'b.md'), 'B');
    await mkdir(path.join(dir, 'x'));
    await mkdir(path.join(dir, 'y'));

    await expect(
      moveNoOverwrite(path.join(dir, 'a.md'), path.join(dir, 'b.md')),
    ).rejects.toMatchObject({
      code: 'EEXIST',
    });
    await expect(moveNoOverwrite(path.join(dir, 'x'), path.join(dir, 'y'))).rejects.toMatchObject({
      code: 'EEXIST',
    });
    expect(await readFile(path.join(dir, 'a.md'), 'utf8')).toBe('A');
    expect(await readFile(path.join(dir, 'b.md'), 'utf8')).toBe('B');
  });
});

describe('MutationLock', () => {
  it('runs tasks one at a time, in order, even when one fails', async () => {
    const lock = new MutationLock();
    const events: string[] = [];
    const task = (name: string, fail = false) =>
      lock.run(async () => {
        events.push(`${name}:start`);
        await new Promise((resolve) => setTimeout(resolve, 5));
        events.push(`${name}:end`);
        if (fail) throw new Error(name);
        return name;
      });
    const results = await Promise.allSettled([task('a'), task('b', true), task('c')]);
    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'rejected', 'fulfilled']);
    expect(events).toEqual(['a:start', 'a:end', 'b:start', 'b:end', 'c:start', 'c:end']);
  });

  it('knows whether the caller is inside one of its tasks', async () => {
    const lock = new MutationLock();
    expect(lock.held()).toBe(false);
    const inside = await lock.run(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      return lock.held();
    });
    expect(inside).toBe(true);
    expect(lock.held()).toBe(false);
  });
});
