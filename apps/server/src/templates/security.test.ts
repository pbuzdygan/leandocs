import { mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { makeTempDir } from '../test/temp-dir.js';
import { TemplateService } from './service.js';
describe('template path security', () => {
  it('refuses an outside-root template directory for startup, listing and instantiation', async () => {
    const root = await makeTempDir();
    const outside = await makeTempDir();
    await writeFile(path.join(outside, 'Private.md'), 'private outside content');
    await symlink(outside, path.join(root, '_templates'));
    const service = new TemplateService(root);
    await expect(service.seed()).rejects.toMatchObject({ code: 'UNSAFE_PATH' });
    await expect(service.list()).rejects.toMatchObject({ code: 'UNSAFE_PATH' });
    await expect(service.instantiate('Private', 'Copy', new Date())).rejects.toMatchObject({
      code: 'UNSAFE_PATH',
    });
    expect(await readFile(path.join(outside, 'Private.md'), 'utf8')).toBe(
      'private outside content',
    );
  });
  it('does not follow template-file symlinks, including dangling symlinks', async () => {
    const root = await makeTempDir();
    const outside = await makeTempDir();
    await mkdir(path.join(root, '_templates'));
    await writeFile(path.join(outside, 'secret'), 'private outside content');
    await symlink(path.join(outside, 'secret'), path.join(root, '_templates', 'Private.md'));
    await symlink(path.join(outside, 'missing'), path.join(root, '_templates', 'Missing.md'));
    const service = new TemplateService(root);
    expect(await service.list()).toEqual([]);
    for (const name of ['Private', 'Missing'])
      await expect(service.instantiate(name, 'Copy', new Date())).rejects.toMatchObject({
        code: 'TEMPLATE_NOT_FOUND',
      });
  });
  it('retains regular templates and missing-folder behavior', async () => {
    const root = await makeTempDir();
    const service = new TemplateService(root);
    expect(await service.list()).toEqual([]);
    await expect(service.instantiate('Missing', 'Copy', new Date())).rejects.toMatchObject({
      code: 'TEMPLATE_NOT_FOUND',
    });
    await service.seed();
    expect((await service.list()).length).toBeGreaterThan(0);
    expect((await service.instantiate('Server', 'Copy', new Date())).body).toContain('Copy');
  });
});
