import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DocumentRegistry, type ContentChanges } from '../documents/registry.js';
import { atomicWriteFile } from '../filesystem/atomic-write.js';
import { MutationLock } from '../filesystem/lock.js';
import { makeTempDir, silentLogger } from '../test/temp-dir.js';
import { ContentSync } from './content-sync.js';
import { ContentWatcher, type ContentWatcherOptions } from './content-watcher.js';

const DEBOUNCE_MS = 50;
const watchers: ContentWatcher[] = [];

afterEach(async () => {
  await Promise.all(watchers.splice(0).map((watcher) => watcher.close()));
});

async function setup(options: Partial<ContentWatcherOptions> = {}) {
  const root = await makeTempDir();
  const registry = new DocumentRegistry(root, { assignMissingIds: false, logger: silentLogger });
  await registry.refresh();
  const lock = new MutationLock();
  const sync = new ContentSync(registry, lock, silentLogger);
  const reports: ContentChanges[] = [];
  sync.onChange((changes) => reports.push(changes));
  const watcher = new ContentWatcher(root, sync, {
    mode: 'native',
    logger: silentLogger,
    debounceMs: DEBOUNCE_MS,
    ...options,
  });
  watchers.push(watcher);
  return { root, registry, lock, sync, reports, watcher };
}

async function started(options: Partial<ContentWatcherOptions> = {}) {
  const context = await setup(options);
  await context.watcher.start();
  const refresh = vi.spyOn(context.sync, 'refresh');
  return { ...context, refresh };
}

/** Long enough for OS events to arrive and several debounce periods to pass. */
function quietPeriod(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 400));
}

const allDocuments = (reports: ContentChanges[]) => reports.flatMap((r) => r.documents);

describe('ContentWatcher', () => {
  it('detects documents created, edited and deleted outside the app', async () => {
    const { root, reports, watcher, refresh } = await started();
    expect(watcher.active).toBe(true);

    await writeFile(path.join(root, 'Runbook.md'), '# Runbook\n');
    await vi.waitFor(() => expect(allDocuments(reports)).toHaveLength(1), { timeout: 5000 });
    expect(allDocuments(reports)[0]).toMatchObject({ kind: 'added', path: 'Runbook.md' });
    expect(refresh).toHaveBeenCalledWith(['Runbook.md']);

    await writeFile(path.join(root, 'Runbook.md'), '# Runbook, edited in VS Code\n');
    await vi.waitFor(() => expect(allDocuments(reports)).toHaveLength(2), { timeout: 5000 });
    expect(allDocuments(reports)[1]).toMatchObject({ kind: 'changed', path: 'Runbook.md' });

    await rm(path.join(root, 'Runbook.md'));
    await vi.waitFor(() => expect(allDocuments(reports)).toHaveLength(3), { timeout: 5000 });
    expect(allDocuments(reports)[2]).toMatchObject({ kind: 'removed', path: 'Runbook.md' });
  });

  it('detects new folders and documents written atomically by editors', async () => {
    const { root, reports } = await started();
    await mkdir(path.join(root, 'Infrastructure'));
    // Editors such as vim and VS Code may save via a temp file plus rename.
    await writeFile(path.join(root, 'Infrastructure', '.Host.md.swp'), '# Host\n');
    await rename(
      path.join(root, 'Infrastructure', '.Host.md.swp'),
      path.join(root, 'Infrastructure', 'Host.md'),
    );

    await vi.waitFor(
      () => {
        const folders = reports.flatMap((r) => r.folders);
        expect(folders).toContainEqual({ kind: 'added', path: 'Infrastructure' });
        expect(allDocuments(reports)).toContainEqual(
          expect.objectContaining({ kind: 'added', path: 'Infrastructure/Host.md' }),
        );
      },
      { timeout: 5000 },
    );
  });

  it('collapses a burst of events into one refresh', async () => {
    const { root, reports, refresh, watcher } = await started();
    for (let index = 0; index < 10; index++)
      await writeFile(path.join(root, `Doc ${index}.md`), `# Doc ${index}\n`);

    await vi.waitFor(() => expect(allDocuments(reports)).toHaveLength(10), { timeout: 5000 });
    await watcher.whenIdle();
    expect(refresh.mock.calls.length).toBeLessThanOrEqual(2);
  });

  it('does not report the app’s own writes', async () => {
    const { root, registry, lock, reports, refresh, watcher } = await started();
    // What DocumentService does: atomic write under the mutation lock, then refresh the registry.
    await lock.run(async () => {
      await atomicWriteFile(path.join(root, 'Saved in app.md'), '# Saved\n');
      await registry.refresh();
    });

    // The watcher sees the write and refreshes, but there is nothing new to report.
    await vi.waitFor(() => expect(refresh).toHaveBeenCalled(), { timeout: 5000 });
    await watcher.whenIdle();
    expect(reports).toEqual([]);
  });

  it('ignores hidden entries, system folders, attachments and non-Markdown files', async () => {
    const { root, refresh, watcher } = await started();
    await writeFile(path.join(root, '.notes.md'), 'hidden');
    await writeFile(path.join(root, 'notes.txt'), 'not a document');
    await mkdir(path.join(root, '_templates'));
    await writeFile(path.join(root, '_templates', 'Meeting.md'), '# Meeting\n');
    await mkdir(path.join(root, '.git'));
    await writeFile(path.join(root, '.git', 'HEAD.md'), 'ref');
    await mkdir(path.join(root, 'Guide.assets'));
    await writeFile(path.join(root, 'Guide.assets', 'diagram.md'), 'attachment');

    await quietPeriod();
    await watcher.whenIdle();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('catches changes made before it was ready', async () => {
    const { root, reports, watcher } = await setup();
    await writeFile(path.join(root, 'Early.md'), '# Early\n');
    await watcher.start();
    expect(allDocuments(reports)).toMatchObject([{ kind: 'added', path: 'Early.md' }]);
  });

  it('supports polling', async () => {
    const { root, reports } = await started({ mode: 'poll', pollIntervalMs: 50 });
    await writeFile(path.join(root, 'Polled.md'), '# Polled\n');
    await vi.waitFor(
      () => expect(allDocuments(reports)).toMatchObject([{ kind: 'added', path: 'Polled.md' }]),
      { timeout: 5000 },
    );
  });

  it('degrades to request-time scanning after an event refresh fails', async () => {
    const { root, sync, refresh, watcher, registry } = await started();
    sync.setWatcherActive(() => watcher.active);
    refresh.mockRejectedValueOnce(new Error('temporary read failure'));
    await writeFile(path.join(root, 'Retry.md'), '# Retry\n');
    await vi.waitFor(() => expect(watcher.active).toBe(false), { timeout: 5000 });
    await sync.ensureFresh();
    expect(registry.findByPath('Retry.md')).toBeDefined();
  });

  it('stops reporting after close', async () => {
    const { root, refresh, watcher } = await started();
    await watcher.close();
    expect(watcher.active).toBe(false);
    await writeFile(path.join(root, 'Late.md'), '# Late\n');
    await quietPeriod();
    expect(refresh).not.toHaveBeenCalled();
  });
});
