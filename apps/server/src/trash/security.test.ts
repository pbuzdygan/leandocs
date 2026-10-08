import { mkdir, readFile, stat, symlink, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { makeTempDir } from '../test/temp-dir.js';
import { TrashService } from './trash.js';
const id = '20261004T120000Z-12345678';
const meta = {
  version: 1,
  kind: 'document',
  name: 'Guide.md',
  originalPath: 'Folder/Guide.md',
  deletedAt: '2026-10-04T12:00:00Z',
};
async function item(root: string, originalPath = meta.originalPath) {
  const folder = path.join(root, '_trash', id);
  await mkdir(folder, { recursive: true });
  await writeFile(
    path.join(folder, '.leandocs-trash.json'),
    JSON.stringify({ ...meta, originalPath }),
  );
  await writeFile(path.join(folder, 'Guide.md'), 'original document');
  return folder;
}
describe('trash path security', () => {
  it('rejects a symlinked trash root without moving or deleting outside files', async () => {
    const root = await makeTempDir();
    const outside = await makeTempDir();
    await item(outside);
    await writeFile(path.join(root, 'Doc.md'), 'current document');
    await symlink(path.join(outside, '_trash'), path.join(root, '_trash'));
    const service = new TrashService(root);
    await expect(
      service.moveToTrash({ kind: 'document', originalPath: 'Doc.md' }),
    ).rejects.toMatchObject({ code: 'UNSAFE_PATH' });
    await expect(service.list()).rejects.toMatchObject({ code: 'UNSAFE_PATH' });
    await expect(service.empty()).rejects.toMatchObject({ code: 'UNSAFE_PATH' });
    await expect(service.remove(id)).rejects.toMatchObject({ code: 'TRASH_ITEM_NOT_FOUND' });
    expect(await readFile(path.join(root, 'Doc.md'), 'utf8')).toBe('current document');
    expect(await readFile(path.join(outside, '_trash', id, 'Guide.md'), 'utf8')).toBe(
      'original document',
    );
  });
  it('does not restore through an outside-root parent symlink or create folders beneath it', async () => {
    const root = await makeTempDir();
    const outside = await makeTempDir();
    const folder = await item(root, 'Folder/New/Guide.md');
    await symlink(outside, path.join(root, 'Folder'));
    await expect(new TrashService(root).restore(id)).rejects.toMatchObject({ code: 'UNSAFE_PATH' });
    await expect(stat(path.join(outside, 'New'))).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await readFile(path.join(folder, 'Guide.md'), 'utf8')).toBe('original document');
  });
  it('ignores symlinked item directories and metadata and refuses symlinked payloads', async () => {
    const root = await makeTempDir();
    const outside = await makeTempDir();
    const external = await item(outside);
    await mkdir(path.join(root, '_trash'));
    await symlink(external, path.join(root, '_trash', id));
    const service = new TrashService(root);
    expect(await service.list()).toEqual([]);
    await expect(service.restore(id)).rejects.toMatchObject({ code: 'TRASH_ITEM_NOT_FOUND' });
    const second = await makeTempDir();
    const payload = path.join(second, '_trash', id);
    await mkdir(payload, { recursive: true });
    await symlink(
      path.join(external, '.leandocs-trash.json'),
      path.join(payload, '.leandocs-trash.json'),
    );
    expect(await new TrashService(second).list()).toEqual([]);
    const third = await makeTempDir();
    const actual = await item(third);
    await unlink(path.join(actual, 'Guide.md'));
    await symlink(path.join(external, 'Guide.md'), path.join(actual, 'Guide.md'));
    await expect(new TrashService(third).restore(id)).rejects.toMatchObject({
      code: 'UNSAFE_PATH',
    });
    expect(await readFile(path.join(external, 'Guide.md'), 'utf8')).toBe('original document');
  });
});
