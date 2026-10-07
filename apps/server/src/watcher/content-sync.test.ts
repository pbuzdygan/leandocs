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
  it('uses the index while watching is healthy and resumes scanning when watching fails', async () => {
    const { root, registry, sync, listener } = await setup();
    let active = true;
    sync.setWatcherActive(() => active);
    const refresh = vi.spyOn(registry, 'refresh');
    await writeFile(path.join(root, 'External.md'), '# External\n');
    await sync.ensureFresh();
    expect(refresh).not.toHaveBeenCalled();
    active = false;
    await sync.ensureFresh();
    expect(refresh).toHaveBeenCalledExactlyOnceWith(undefined);
    expect(listener).toHaveBeenCalledOnce();
    expect(registry.findByPath('External.md')).toBeDefined();
  });

  it('waits for mutations on healthy reads and does not reacquire a lock it already owns', async () => {
    const { root, registry, lock, sync } = await setup();
    sync.setWatcherActive(() => true);
    let release!: () => void;
    const mutation = lock.run(async () => {
      await sync.ensureFresh();
      await writeFile(path.join(root, 'Mine.md'), '# Mine\n');
      await new Promise<void>((resolve) => (release = resolve));
      await registry.refresh();
    });
    const done = vi.fn();
    const read = sync.ensureFresh().then(done);
    await vi.waitFor(() => expect(release).toBeDefined());
    expect(done).not.toHaveBeenCalled();
    release();
    await Promise.all([mutation, read]);
    expect(registry.findByPath('Mine.md')).toBeDefined();
  });

  it('reports changes made outside the app', async () => {
    const { root, sync, listener } = await setup();
    await writeFile(path.join(root, 'External.md'), '# External\n');

    const changes = await sync.refresh();

    expect(changes.documents).toMatchObject([{ kind: 'added', path: 'External.md' }]);
    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith(changes);
  });

  it('rechecks watcher health after a queued read acquires the lock and reports outside it', async () => {
    const { root, registry, lock, sync } = await setup();
    let active = true;
    let release!: () => void;
    sync.setWatcherActive(() => active);
    const reportedWhileHeld: boolean[] = [];
    sync.onChange(() => reportedWhileHeld.push(lock.held()));
    const mutation = lock.run(() => new Promise<void>((resolve) => (release = resolve)));
    const read = sync.ensureFresh();
    await vi.waitFor(() => expect(release).toBeDefined());
    await writeFile(path.join(root, 'External.md'), '# External\n');
    active = false;
    release();
    await Promise.all([mutation, read]);
    expect(registry.findByPath('External.md')).toBeDefined();
    expect(reportedWhileHeld).toEqual([false]);
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

  it('re-reads only the written files while watching is healthy, everything otherwise', async () => {
    const { root, registry, lock, sync, listener } = await setup();
    let active = true;
    sync.setWatcherActive(() => active);
    await writeFile(path.join(root, 'External.md'), '# External\n');
    await lock.run(async () => {
      await writeFile(path.join(root, 'Mine.md'), '# Mine\n');
      await sync.refreshWritten(['Mine.md']);
    });
    expect(registry.findByPath('Mine.md')).toBeDefined();
    // Left to the watcher, which reports it as an external change instead of hiding it.
    expect(registry.findByPath('External.md')).toBeUndefined();
    expect((await sync.refresh(['External.md'])).documents).toMatchObject([
      { kind: 'added', path: 'External.md' },
    ]);
    expect(listener).toHaveBeenCalledOnce();

    active = false;
    await writeFile(path.join(root, 'Later.md'), '# Later\n');
    await lock.run(async () => {
      await writeFile(path.join(root, 'Mine.md'), '# Mine again\n');
      await sync.refreshWritten(['Mine.md']);
    });
    expect(registry.findByPath('Later.md')).toBeDefined();
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
