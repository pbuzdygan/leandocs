import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DocumentRegistry } from '../documents/registry.js';
import { MutationLock } from '../filesystem/lock.js';
import { makeTempDir, silentLogger } from '../test/temp-dir.js';
import { ContentSync } from '../watcher/content-sync.js';
import { AttachmentService } from './service.js';

describe('AttachmentService reads', () => {
  it.each([
    ['watching', true],
    ['not watching', false],
  ])('do not hold up mutations while a large file is read (KI-8, %s)', async (_, watching) => {
    const root = await makeTempDir();
    await writeFile(path.join(root, 'Doc.md'), '---\nid: doc\n---\n# Doc\n');
    await mkdir(path.join(root, 'Doc.assets'));
    const size = 16 * 1024 * 1024;
    await writeFile(path.join(root, 'Doc.assets', 'big.txt'), Buffer.alloc(size, 'a'));
    const registry = new DocumentRegistry(root, { assignMissingIds: false, logger: silentLogger });
    await registry.refresh();
    const lock = new MutationLock();
    const sync = new ContentSync(registry, lock, silentLogger);
    sync.setWatcherActive(() => watching);
    const attachments = new AttachmentService(root, registry, lock, size, sync);

    const order: string[] = [];
    const download = attachments.get('doc', 'big.txt').then((result) => {
      order.push('download');
      return result;
    });
    // Queued right after the read started: it used to wait for the whole file.
    const mutation = lock.run(async () => {
      order.push('mutation');
    });
    await Promise.all([download, mutation]);
    expect(order).toEqual(['mutation', 'download']);
    expect((await download).bytes.length).toBe(size);
    expect(await attachments.list('doc')).toMatchObject([{ name: 'big.txt', size }]);
  });
});
