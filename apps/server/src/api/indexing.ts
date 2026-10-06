import path from 'node:path';
import type { IndexRebuildStatus, IndexStatusResponse } from '@leandocs/shared';
import type { FastifyPluginAsync } from 'fastify';
import { DATABASE_FILE } from '../db/database.js';
import type { DocumentRegistry } from '../documents/registry.js';
import { attachmentsSize, databaseSize } from '../filesystem/usage.js';
import type { ContentSync } from '../watcher/content-sync.js';

export interface IndexingRoutesOptions {
  registry: DocumentRegistry;
  sync: ContentSync;
  dataDir: string;
  contentDir: string;
  systemDir: string;
}

/** Index status and full rebuild (PROJECT_SPEC §31, §60; UI_SPEC §86–87). */
export const indexingRoutes: FastifyPluginAsync<IndexingRoutesOptions> = async (app, options) => {
  const { registry, sync, dataDir, contentDir, systemDir } = options;
  const job: Omit<IndexRebuildStatus, 'lastRebuildAt'> = { state: 'idle', done: 0, total: 0 };
  let running: Promise<void> | undefined;

  const rebuildStatus = (): IndexRebuildStatus => ({
    ...job,
    lastRebuildAt: registry.store.getMeta('lastRebuildAt') ?? null,
  });

  const status = async (): Promise<IndexStatusResponse> => {
    // While a rebuild runs, the registry queue is busy; report the last known state instead of
    // waiting for it.
    if (!running) await sync.ensureFresh();
    const tags = registry.store.db.prepare('SELECT count(*) FROM tags').pluck().get() as number;
    return {
      documents: registry.list().length,
      folders: registry.folders().length,
      tags,
      issues: registry.issues(),
      storage: {
        dataDir,
        contentDir,
        attachmentsBytes: await attachmentsSize(contentDir),
        databaseBytes: await databaseSize(path.join(systemDir, DATABASE_FILE)),
      },
      rebuild: rebuildStatus(),
    };
  };

  app.get('/index/status', status);

  // Starts a rebuild in the background and answers at once; poll GET /index/status for progress.
  // A request while a rebuild is running joins it instead of starting another one.
  app.post('/index/rebuild', async (request, reply) => {
    if (!running) {
      Object.assign(job, { state: 'running', done: 0, total: 0 });
      delete job.error;
      running = registry
        .rebuild((done, total) => Object.assign(job, { done, total }))
        .then(() => {
          job.state = 'idle';
          request.log.info({ documents: registry.list().length }, 'Index rebuilt');
        })
        .catch((error: unknown) => {
          job.state = 'failed';
          job.error = error instanceof Error ? error.message : String(error);
          request.log.error({ err: error }, 'Index rebuild failed');
        })
        .finally(() => {
          running = undefined;
        });
    }
    return reply.status(202).send(rebuildStatus());
  });

  // Let an in-flight rebuild finish before the database is closed.
  app.addHook('onClose', async () => {
    await running;
  });
};
