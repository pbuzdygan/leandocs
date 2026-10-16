import { lstat, readFile, stat, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { openDatabase } from '../db/database.js';
import { makeTempDir, silentLogger } from '../test/temp-dir.js';
import { AuthInitialization } from './initialized.js';
import { SETUP_TOKEN_FILE, SetupService } from './setup.js';

async function service() {
  const dir = await makeTempDir();
  const db = openDatabase(dir, silentLogger);
  const warnings: { obj: object; msg: string }[] = [];
  const setup = new SetupService(db, '/data/content', new AuthInitialization(db, dir), dir, {
    warn: (obj, msg) => warnings.push({ obj, msg }),
  });
  return { dir, db, setup, warnings, file: path.join(dir, SETUP_TOKEN_FILE) };
}

describe('setup token delivery (ADR-0026)', () => {
  it('writes the token to a private file and the log, never to the status', async () => {
    const { db, setup, warnings, file } = await service();
    try {
      await setup.prepare(true);
      const token = (await readFile(file, 'utf8')).trim();
      expect(token).toMatch(/^[0-9a-f]{64}$/);
      expect((await stat(file)).mode & 0o777).toBe(0o600);
      expect(warnings).toHaveLength(1);
      expect(warnings[0]!.msg).toContain(token);
      expect(warnings[0]!.obj).toEqual({ setupTokenFile: `system/${SETUP_TOKEN_FILE}` });
      expect(setup.status()).toEqual({ required: true });
    } finally {
      db.close();
    }
  });

  it('replaces a planted file or symbolic link without touching its target', async () => {
    const { dir, db, setup, file } = await service();
    try {
      const target = path.join(dir, 'outside.txt');
      await writeFile(target, 'keep me');
      await symlink(target, file);
      await setup.prepare(true);
      expect((await lstat(file)).isSymbolicLink()).toBe(false);
      expect(await readFile(target, 'utf8')).toBe('keep me');
    } finally {
      db.close();
    }
  });

  it('issues no token when authentication is not local and removes an old one', async () => {
    const { db, setup, warnings, file } = await service();
    try {
      await writeFile(file, `${'a'.repeat(64)}\n`);
      await setup.prepare(false);
      await expect(stat(file)).rejects.toMatchObject({ code: 'ENOENT' });
      expect(warnings).toEqual([]);
    } finally {
      db.close();
    }
  });
});
