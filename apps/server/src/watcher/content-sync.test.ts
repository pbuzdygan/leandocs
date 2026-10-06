import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { DocumentRegistry } from '../documents/registry.js';
import { MutationLock } from '../filesystem/lock.js';
import { makeTempDir, silentLogger } from '../test/temp-dir.js';
import { ContentSync } from './content-sync.js';

async function setup() {
  const root = await makeTempDir();
  const registry = new DocumentRegistry(root, { assignMissingIds: false, logger: silentLogger });
  await registry.refresh();
  const lock = new MutationLock();
  const sync = new ContentSync(registry, lock, silentLogger);
  const listener = vi.fn();
  sync.onChange(listener);
  return { root, registry, lock, sync, listener };
}

describe('ContentSync', () => {
  it('reports changes made outside the app', async () => {
    const { root, sync, listener } = await setup();
    await writeFile(path.join(root, 'External.md'), '# External\n');

    const changes = await sync.refresh();

    expect(changes.documents).toMatchObject([{ kind: 'added', path: 'External.md' }]);
    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith(changes);
  });

  it('does not report the app’s own writes, even when a later refresh runs', async () => {
    const { root, registry, lock, sync, listener } = await setup();
    // What every mutation does: write under the lock, refresh, release.
    await lock.run(async () => {
      await writeFile(path.join(root, 'Mine.md'), '# Mine\n');
      await sync.refresh();
    });
    expect(registry.findByPath('Mine.md')).toBeDefined();

    expect((await sync.refresh()).documents).toEqual([]);
    expect(listener).not.toHaveBeenCalled();
  });

  it('waits for a running mutation instead of reporting its half-done writes', async () => {
    const { root, registry, lock, sync, listener } = await setup();
    let release!: () => void;
    const mutation = lock.run(async () => {
      await writeFile(path.join(root, 'Mine.md'), '# Mine\n');
      await new Promise<void>((resolve) => (release = resolve));
      await registry.refresh();
    });
    const read = sync.refresh();
    await new Promise((resolve) => setTimeout(resolve, 10));
    release();
    await mutation;

    expect((await read).documents).toEqual([]);
    expect(listener).not.toHaveBeenCalled();
  });

  it('keeps notifying other listeners when one throws', async () => {
    const { root, sync, listener } = await setup();
    const failing = vi.fn(() => {
      throw new Error('boom');
    });
    const unsubscribe = sync.onChange(failing);
    await writeFile(path.join(root, 'A.md'), '# A\n');
    await sync.refresh();
    expect(failing).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledOnce();

    unsubscribe();
    await writeFile(path.join(root, 'B.md'), '# B\n');
    await sync.refresh();
    expect(failing).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
