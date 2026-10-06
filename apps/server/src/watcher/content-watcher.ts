import type { Stats } from 'node:fs';
import path from 'node:path';
import { watch, type FSWatcher } from 'chokidar';
import { isDocumentFileName } from '../filesystem/file-name.js';
import { isHiddenEntry } from '../documents/scanner.js';
import type { ContentSync } from './content-sync.js';

export interface WatcherLogger {
  info(obj: object, msg: string): void;
  warn(obj: object, msg: string): void;
  error(obj: object, msg: string): void;
  debug(obj: object, msg: string): void;
}

export interface ContentWatcherOptions {
  /** `native` uses OS file events; `poll` stats files on an interval (network shares, some mounts). */
  mode: 'native' | 'poll';
  logger: WatcherLogger;
  /** Quiet period after the last event before the registry is refreshed. */
  debounceMs?: number;
  /** A steady stream of events (e.g. `git checkout`) still refreshes at least this often. */
  maxWaitMs?: number;
  pollIntervalMs?: number;
}

const FILE_EVENTS = new Set(['add', 'change', 'unlink']);
const DIRECTORY_EVENTS = new Set(['addDir', 'unlinkDir']);

/**
 * Watches the content directory for changes made outside the app (PROJECT_SPEC §27, P12-01).
 *
 * Events are only a trigger: after a quiet period they collapse into one ContentSync refresh, which
 * re-reads the filesystem (the source of truth) under the mutation lock. The app's own writes are
 * already indexed by then, so they produce no difference and are not reported. Only what the
 * registry tracks is watched: visible folders and `*.md` files (no dot-entries such as atomic-write
 * temp files, no root `_` system folders, no `.assets` folders); symlinks are not followed.
 */
export class ContentWatcher {
  private watcher: FSWatcher | undefined;
  private readonly pending = new Set<string>();
  private timer: NodeJS.Timeout | undefined;
  private firstPendingAt: number | undefined;
  private flushing: Promise<void> = Promise.resolve();
  private healthy = false;
  private closed = false;
  private readonly debounceMs: number;
  private readonly maxWaitMs: number;

  constructor(
    private readonly contentDir: string,
    private readonly sync: ContentSync,
    private readonly options: ContentWatcherOptions,
  ) {
    this.debounceMs = options.debounceMs ?? 250;
    this.maxWaitMs = options.maxWaitMs ?? 2000;
  }

  /** True while file events arrive reliably. After a watcher error it stays false. */
  get active(): boolean {
    return this.healthy && !this.closed;
  }

  /**
   * Starts watching and resolves when the initial walk is done. A watcher failure is logged, never
   * thrown: the app keeps working and picks up external changes on the next request instead.
   */
  async start(): Promise<void> {
    const interval = this.options.pollIntervalMs ?? 1000;
    const watcher = watch(this.contentDir, {
      ignoreInitial: true,
      followSymlinks: false,
      usePolling: this.options.mode === 'poll',
      interval,
      binaryInterval: interval,
      ignored: (absolute: string, stats?: Stats) => this.ignored(absolute, stats),
    });
    this.watcher = watcher;
    let failed = false;
    watcher.on('all', (event, absolute) => this.record(event, absolute));
    watcher.on('error', (error: unknown) => {
      failed = true;
      this.healthy = false;
      this.options.logger.warn(
        { err: error },
        'File watcher failed; external changes are picked up on the next request',
      );
    });
    await new Promise<void>((resolve) => {
      watcher.once('ready', resolve);
      watcher.once('error', () => resolve());
    });
    if (this.closed) return;
    this.healthy = !failed;
    // Catch changes made between the startup scan and the end of the initial walk.
    this.pending.add('');
    this.flush();
    await this.flushing;
    this.options.logger.info({ mode: this.options.mode }, 'Watching content for external changes');
  }

  /** Resolves once no events are waiting and no refresh is running (tests, shutdown). */
  async whenIdle(): Promise<void> {
    while (this.timer || this.pending.size > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.debounceMs));
    }
    await this.flushing;
  }

  async close(): Promise<void> {
    this.closed = true;
    clearTimeout(this.timer);
    this.timer = undefined;
    this.pending.clear();
    await this.watcher?.close();
    await this.flushing;
  }

  private ignored(absolute: string, stats?: Stats): boolean {
    const relative = path.relative(this.contentDir, absolute);
    if (relative === '') return false;
    if (relative.startsWith('..') || path.isAbsolute(relative)) return true;
    const segments = relative.split(path.sep);
    const name = segments.pop()!;
    for (let index = 0; index < segments.length; index++) {
      if (isHiddenEntry(segments[index]!, segments.slice(0, index).join('/'), true)) return true;
    }
    if (name.startsWith('.')) return true;
    // Chokidar asks again with stats once it knows the entry type.
    if (!stats) return false;
    if (stats.isDirectory()) return isHiddenEntry(name, segments.join('/'), true);
    return !isDocumentFileName(name);
  }

  private record(event: string, absolute: string): void {
    if (this.closed) return;
    const isFileEvent = FILE_EVENTS.has(event);
    if (!isFileEvent && !DIRECTORY_EVENTS.has(event)) return;
    // Deleted entries arrive without stats, so file events are filtered by name here.
    if (isFileEvent && !isDocumentFileName(path.basename(absolute))) return;
    this.pending.add(path.relative(this.contentDir, absolute).split(path.sep).join('/'));
    this.schedule();
  }

  private schedule(): void {
    const now = Date.now();
    this.firstPendingAt ??= now;
    clearTimeout(this.timer);
    const wait = Math.min(this.debounceMs, Math.max(0, this.firstPendingAt + this.maxWaitMs - now));
    this.timer = setTimeout(() => this.flush(), wait);
  }

  private flush(): void {
    this.timer = undefined;
    this.firstPendingAt = undefined;
    const paths = [...this.pending];
    this.pending.clear();
    this.flushing = this.flushing.then(async () => {
      if (this.closed) return;
      try {
        const changes = await this.sync.refresh();
        this.options.logger.debug(
          { paths: paths.slice(0, 20), events: paths.length, documents: changes.documents.length },
          'File events processed',
        );
      } catch (error) {
        this.options.logger.error({ err: error }, 'Refresh after file events failed');
      }
    });
  }
}
