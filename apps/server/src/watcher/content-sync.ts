import type { MutationLock } from '../filesystem/lock.js';
import { hasChanges, type ContentChanges, type DocumentRegistry } from '../documents/registry.js';

export type ContentChangeListener = (changes: ContentChanges) => void;

export interface SyncLogger {
  info(obj: object, msg: string): void;
  error(obj: object, msg: string): void;
}

/**
 * The way to re-sync the registry outside an application operation (PROJECT_SPEC §27, P12-01).
 *
 * Every content mutation holds the MutationLock and refreshes the registry before releasing it, so
 * the app's own writes are already indexed whenever the lock is free. A refresh that takes the lock
 * therefore only finds changes made by someone else (an editor, `git pull`, a script) and reports
 * them to the listeners. Called inside a mutation, the refresh belongs to that mutation and nothing
 * is reported: the app's own writes never come back as external changes.
 */
export class ContentSync {
  private readonly listeners = new Set<ContentChangeListener>();

  constructor(
    private readonly registry: DocumentRegistry,
    private readonly lock: MutationLock,
    private readonly logger: SyncLogger,
  ) {}

  /** Subscribes to external changes; returns the unsubscribe function. */
  onChange(listener: ContentChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async refresh(): Promise<ContentChanges> {
    if (this.lock.held()) return this.registry.refresh();
    const changes = await this.lock.run(() => this.registry.refresh());
    if (hasChanges(changes)) this.report(changes);
    return changes;
  }

  private report(changes: ContentChanges): void {
    this.logger.info(
      { documents: changes.documents.length, folders: changes.folders.length },
      'External content change',
    );
    for (const listener of this.listeners) {
      try {
        listener(changes);
      } catch (error) {
        this.logger.error({ err: error }, 'Content change listener failed');
      }
    }
  }
}
