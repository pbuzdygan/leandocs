import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach } from 'vitest';

const created: string[] = [];

afterEach(async () => {
  await Promise.all(created.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

/** A real temporary directory, removed automatically after each test. */
export async function makeTempDir(prefix = 'leandocs-'): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), prefix));
  created.push(dir);
  return dir;
}

export const silentLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  debug: () => undefined,
};
