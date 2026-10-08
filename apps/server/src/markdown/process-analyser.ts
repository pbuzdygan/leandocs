import { fork, type ChildProcess } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  TOO_LARGE,
  tooLarge,
  type AnalysisResult,
  type ConversionResult,
  type Failure,
  type MarkdownAnalyser,
} from './analysis.js';
import type { Task } from './analysis-process.js';

export interface AnalysisLimits {
  /** Longest time one document may take; the process is then stopped and replaced. */
  timeoutMs: number;
  /** Heap of the analysis process; running out ends only that process, never the server. */
  maxHeapMb: number;
}

export const DEFAULT_ANALYSIS_LIMITS: AnalysisLimits = { timeoutMs: 20_000, maxHeapMb: 512 };

interface Logger {
  warn(obj: object, msg: string): void;
}

interface Job {
  task: Task;
  resolve: (result: AnalysisResult | ConversionResult) => void;
  reject: (error: Error) => void;
}

interface Running extends Job {
  id: number;
  timer: NodeJS.Timeout;
  child: ChildProcess;
}

// From the sources (development, tests) the entry is TypeScript and needs the tsx loader; the
// production bundle builds it as `dist/analysis-process.js` next to `dist/main.js`.
const fromSource = import.meta.url.endsWith('.ts');
const ENTRY = fileURLToPath(
  new URL(fromSource ? './analysis-process.ts' : './analysis-process.js', import.meta.url),
);
const LOADER = fromSource
  ? ['--import', pathToFileURL(createRequire(import.meta.url).resolve('tsx')).href]
  : [];

const STOPPED = 'Markdown analysis has stopped';

/**
 * Parses Markdown in a child process with a time and memory limit (ADR-0025), so a document
 * that is too large or crafted to be slow never blocks or crashes the server. A worker thread
 * is not enough: V8 can abort the whole process when a thread exceeds its heap limit. Documents
 * are analysed one at a time; a stopped or crashed process is replaced for the next one.
 */
export class ProcessAnalyser implements MarkdownAnalyser {
  private child: ChildProcess | undefined;
  private readonly queue: Job[] = [];
  private running: Running | undefined;
  private nextId = 0;
  private closed = false;

  constructor(
    private readonly limits: AnalysisLimits = DEFAULT_ANALYSIS_LIMITS,
    private readonly logger?: Logger,
  ) {}

  analyse(body: string): Promise<AnalysisResult> {
    if (tooLarge(body)) return Promise.resolve({ ok: false, reason: TOO_LARGE });
    return this.run({ task: 'analyse', input: body }) as Promise<AnalysisResult>;
  }

  convertHtml(bytes: Uint8Array): Promise<ConversionResult> {
    return this.run({ task: 'convert-html', input: bytes }) as Promise<ConversionResult>;
  }

  private run(task: Task): Promise<AnalysisResult | ConversionResult> {
    if (this.closed) return Promise.reject(new Error(STOPPED));
    return new Promise((resolve, reject) => {
      this.queue.push({ task, resolve, reject });
      this.next();
    });
  }

  close(): Promise<void> {
    this.closed = true;
    const pending = [...(this.running ? [this.running] : []), ...this.queue];
    if (this.running) clearTimeout(this.running.timer);
    this.running = undefined;
    this.queue.length = 0;
    for (const job of pending) job.reject(new Error(STOPPED));
    const child = this.child;
    this.child = undefined;
    if (!child || child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
    return new Promise((resolve) => {
      child.once('exit', () => resolve());
      child.kill('SIGKILL');
    });
  }

  private next(): void {
    if (this.running || this.closed) return;
    const job = this.queue.shift();
    if (!job) return;
    const child = this.ensureChild();
    const id = ++this.nextId;
    const timer = setTimeout(() => {
      this.stop(child);
      this.finish(id, {
        ok: false,
        reason: `too complex to read within ${this.limits.timeoutMs / 1000} seconds`,
      });
    }, this.limits.timeoutMs);
    this.running = { ...job, id, timer, child };
    child.send({ id, ...job.task });
  }

  private finish(id: number, result: AnalysisResult | ConversionResult | Failure): void {
    const running = this.running;
    if (!running || running.id !== id) return;
    clearTimeout(running.timer);
    this.running = undefined;
    if (!result.ok) this.logger?.warn({ reason: result.reason }, 'Markdown analysis limited');
    running.resolve(result);
    this.next();
  }

  private ensureChild(): ChildProcess {
    if (this.child) return this.child;
    const child = fork(ENTRY, [], {
      execArgv: [...LOADER, `--max-old-space-size=${this.limits.maxHeapMb}`],
      serialization: 'advanced',
      // Its only output would be a crash report; the server logs the outcome instead.
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    });
    // An idle analysis process must not keep the server running.
    child.unref();
    child.channel?.unref();
    child.on(
      'message',
      ({ id, result }: { id: number; result: AnalysisResult | ConversionResult }) =>
        this.finish(id, result),
    );
    // A stopped process can report its exit after its replacement took the next document:
    // only the document running in this process fails.
    child.on('exit', (code, signal) => {
      this.stop(child);
      const running = this.running?.child === child ? this.running : undefined;
      if (!running) return;
      // V8 aborts (SIGABRT, exit code 134) when the heap limit is reached.
      const outOfMemory = signal === 'SIGABRT' || code === 134;
      this.finish(running.id, {
        ok: false,
        reason: outOfMemory
          ? `too large to read within ${this.limits.maxHeapMb} MiB of memory`
          : 'not readable',
      });
    });
    child.on('error', () => this.stop(child));
    this.child = child;
    return child;
  }

  /** Forgets `child` (the next document starts a new one) and stops it if still running. */
  private stop(child: ChildProcess): void {
    if (this.child === child) this.child = undefined;
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  }
}
