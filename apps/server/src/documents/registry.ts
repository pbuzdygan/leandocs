import { createHash, randomUUID } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import {
  type ScanIssue,
  type TreeFolderNode,
  type TreeNode,
  type ContentChanges,
  type DocumentChange,
  type FolderChange,
} from '@leandocs/shared';
import Database from 'better-sqlite3';
import { migrate } from '../db/migrations.js';
import { atomicWriteFile } from '../filesystem/atomic-write.js';
import { documentStem } from '../filesystem/file-name.js';
import { parseFile, toIsoTimestamp, updateFileFrontmatter } from './frontmatter.js';
import { IndexStore, type IndexRecord } from './index-store.js';
import { revisionOf } from './revision.js';
import { containsPath, scanContent, scanContentPaths, type ScannedFile } from './scanner.js';
import { trimTrailing } from '../text.js';
import {
  inlineAnalyser,
  type AnalysisResult,
  type MarkdownAnalyser,
} from '../markdown/analysis.js';

/**
 * Document registry backed by the SQLite index (P8-02, PROJECT_SPEC §62). Lookups are served from
 * memory; every refresh writes the changes to `documents`, tags, aliases and `documents_fts` in one
 * transaction. On startup the stored rows seed the cache, so only files whose mtime/size changed
 * since the last run are re-read (incremental reconcile, no full rebuild). Everything here is
 * derived from the filesystem and can be rebuilt at any time (ADR-0001/0003).
 */

export interface DocumentEntry {
  id: string;
  /** `provisional` ids are derived from the path because the file has no usable `id`. */
  idSource: 'frontmatter' | 'provisional';
  path: string;
  title: string;
  /** Front matter `aliases` (P9-02: wiki links resolve through them). */
  aliases: string[];
  mtimeMs: number;
  size: number;
  /** Too large or complex to analyse (ADR-0025): why. Shown and indexed as plain text. */
  analysisLimited?: string;
}

/** One document that appeared, changed on disk or disappeared during a refresh. */
export type { DocumentChange, FolderChange, ContentChanges } from '@leandocs/shared';

export function hasChanges(changes: ContentChanges): boolean {
  return changes.documents.length > 0 || changes.folders.length > 0;
}

export type { ScanIssue };

export interface RegistryLogger {
  info(obj: object, msg: string): void;
  warn(obj: object, msg: string): void;
}

export interface RegistryOptions {
  /** D-10: write a UUID (and other missing required fields) into files that lack an `id`. */
  assignMissingIds: boolean;
  logger: RegistryLogger;
  /** Migrated index database; a private in-memory database is used when omitted (tests). */
  db?: Database.Database;
  /**
   * Parses document bodies (ADR-0025). The server passes a ProcessAnalyser with time and memory
   * limits; the default parses in this thread without limits (tests).
   */
  analyser?: MarkdownAnalyser;
}

/** Index fields of a file that was just read; the id is resolved later against all files. */
type FileContent = Omit<IndexRecord, 'id' | 'idSource'>;

interface FileMeta {
  frontmatterId: unknown;
  hasValidFrontmatter: boolean;
  frontmatterError?: string;
  title: string;
  aliases: string[];
  analysisLimited?: string;
}

interface CacheEntry {
  mtimeMs: number;
  size: number;
  meta: FileMeta | undefined;
  readError?: string;
  contentHash?: string;
}

// Ids end up in URLs (UI_SPEC §127), so only URL-safe ids are accepted.
const VALID_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

export function isValidDocumentId(id: unknown): id is string {
  return typeof id === 'string' && VALID_ID.test(id);
}

export function provisionalId(relativePath: string): string {
  return `p-${createHash('sha256').update(relativePath).digest('hex').slice(0, 24)}`;
}

/** Title precedence: front matter `title` → first `# H1` → file name. */
export function deriveTitle(data: Record<string, unknown>, body: string, fileName: string): string {
  if (typeof data.title === 'string' && data.title.trim() !== '') return data.title.trim();
  // Each line is matched once; the closing `#`s are trimmed without a backtracking pattern.
  for (const heading of body.matchAll(/^#[ \t]+(.*)$/gm)) {
    const text = trimTrailing(heading[1]!, ' \t#').trim();
    if (text) return text;
  }
  return documentStem(fileName);
}

export class DocumentRegistry {
  private byId = new Map<string, DocumentEntry>();
  private folderPaths: string[] = [];
  private currentIssues: ScanIssue[] = [];
  private cache = new Map<string, CacheEntry>();
  /** What the database currently holds: path → resolved id. */
  private indexed = new Map<string, { id: string; idSource: DocumentEntry['idSource'] }>();
  private queue: Promise<void> = Promise.resolve();
  readonly store: IndexStore;

  private readonly analyser: MarkdownAnalyser;
  /** Assigning an id rewrites only the front matter: its body is not analysed twice. */
  private lastAnalysis: { body: string; result: AnalysisResult } | undefined;

  constructor(
    private readonly contentDir: string,
    private readonly options: RegistryOptions,
  ) {
    this.analyser = options.analyser ?? inlineAnalyser;
    let db = options.db;
    if (!db) {
      db = new Database(':memory:');
      migrate(db);
    }
    this.store = new IndexStore(db);
    this.loadStored();
  }

  get(id: string): DocumentEntry | undefined {
    return this.byId.get(id);
  }

  list(): DocumentEntry[] {
    return [...this.byId.values()].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  }

  findByPath(relativePath: string): DocumentEntry | undefined {
    return this.list().find((entry) => entry.path === relativePath);
  }

  folders(): string[] {
    return [...this.folderPaths];
  }

  issues(): ScanIssue[] {
    return [...this.currentIssues];
  }

  /**
   * Re-syncs the whole tree, or only event paths/subtrees when supplied. Calls are serialised.
   * Explicit file events are re-read even if a writer preserved mtime and size.
   */
  refresh(paths?: readonly string[]): Promise<ContentChanges> {
    const requested = paths ? [...paths] : undefined;
    return this.enqueue(() => this.doRefresh(undefined, requested));
  }

  /**
   * Full rebuild (PROJECT_SPEC §31): drop every derived row, then re-read and re-index all files.
   * App settings in the same database are kept.
   */
  rebuild(onProgress?: (done: number, total: number) => void): Promise<void> {
    return this.enqueue(async () => {
      this.store.clear();
      this.cache.clear();
      this.indexed.clear();
      await this.doRefresh(onProgress);
      this.store.setMeta('lastRebuildAt', new Date().toISOString());
    });
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task);
    this.queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  /** Seeds the cache from the database so unchanged files are not re-read after a restart. */
  private loadStored(): void {
    for (const row of this.store.documents()) {
      const meta: FileMeta = {
        frontmatterId: row.frontmatterId,
        hasValidFrontmatter: row.frontmatterError === undefined,
        title: row.title,
        aliases: row.aliases,
      };
      if (row.frontmatterError !== undefined) meta.frontmatterError = row.frontmatterError;
      if (row.analysisLimited !== undefined) meta.analysisLimited = row.analysisLimited;
      this.indexed.set(row.path, { id: row.id, idSource: row.idSource });
      // A file still waiting for an id (e.g. ASSIGN_MISSING_IDS was off) must be read again.
      if (!this.needsId(meta))
        this.cache.set(row.path, {
          mtimeMs: row.mtimeMs,
          size: row.size,
          meta,
          contentHash: row.contentHash,
        });
    }
  }

  tree(): TreeFolderNode {
    const root: TreeFolderNode = { type: 'folder', name: '', path: '', children: [] };
    const folders = new Map<string, TreeFolderNode>([['', root]]);
    const folderFor = (folderPath: string): TreeFolderNode => {
      const existing = folders.get(folderPath);
      if (existing) return existing;
      const slash = folderPath.lastIndexOf('/');
      const parent = folderFor(slash === -1 ? '' : folderPath.slice(0, slash));
      const node: TreeFolderNode = {
        type: 'folder',
        name: folderPath.slice(slash + 1),
        path: folderPath,
        children: [],
      };
      parent.children.push(node);
      folders.set(folderPath, node);
      return node;
    };
    for (const folderPath of this.folderPaths) folderFor(folderPath);
    for (const entry of this.list()) {
      const slash = entry.path.lastIndexOf('/');
      folderFor(slash === -1 ? '' : entry.path.slice(0, slash)).children.push({
        type: 'document',
        id: entry.id,
        title: entry.title,
        name: entry.path.slice(slash + 1),
        path: entry.path,
        ...(entry.aliases.length > 0 ? { aliases: entry.aliases } : {}),
      });
    }
    sortTree(root);
    return root;
  }

  private async doRefresh(
    onProgress?: (done: number, total: number) => void,
    paths?: readonly string[],
  ): Promise<ContentChanges> {
    const partial = paths ? await scanContentPaths(this.contentDir, paths) : undefined;
    const scan = partial ?? (await scanContent(this.contentDir));
    const roots = partial?.roots ?? [''];
    const affected = (candidate: string) => roots.some((root) => containsPath(root, candidate));
    const issues: ScanIssue[] = this.currentIssues.filter(
      (issue) => issue.code === 'ID_ASSIGNMENT_FAILED' && !affected(issue.path),
    );
    const nextCache = new Map([...this.cache].filter(([relative]) => !affected(relative)));
    const fresh = new Map<string, FileContent>();

    for (const file of scan.files) {
      let cached = this.cache.get(file.path);
      if (
        !cached ||
        cached.mtimeMs !== file.mtimeMs ||
        cached.size !== file.size ||
        paths?.includes(file.path)
      ) {
        let read = await this.readFile(file);
        if (read.entry.meta && this.needsId(read.entry.meta)) {
          read = await this.assignId(file, read, issues);
        }
        cached = read.entry;
        if (read.content) fresh.set(file.path, read.content);
      }
      nextCache.set(file.path, cached);
      onProgress?.(nextCache.size, scan.files.length);
    }

    const byId = new Map<string, DocumentEntry>();
    // Global code-point order keeps duplicate-id ownership deterministic without reading other files.
    for (const relativePath of [...nextCache.keys()].sort()) {
      const file = { path: relativePath };
      const cached = nextCache.get(relativePath);
      if (!cached) continue;
      if (cached.readError || !cached.meta) {
        issues.push({
          code: 'UNREADABLE',
          path: file.path,
          message: cached.readError ?? 'Unreadable',
        });
        continue;
      }
      const { meta } = cached;
      if (meta.frontmatterError) {
        issues.push({
          code: 'FRONTMATTER_INVALID',
          path: file.path,
          message: meta.frontmatterError,
        });
      }
      if (meta.analysisLimited)
        issues.push({
          code: 'TOO_COMPLEX',
          path: file.path,
          message: `Shown and searched as plain text; links and headings are not indexed. The document is ${meta.analysisLimited}.`,
        });
      let id: string | undefined;
      if (meta.frontmatterId !== undefined && meta.frontmatterId !== null) {
        if (!isValidDocumentId(meta.frontmatterId)) {
          issues.push({
            code: 'INVALID_ID',
            path: file.path,
            message: `Front matter id ${JSON.stringify(meta.frontmatterId)} is not a valid id`,
          });
        } else if (byId.has(meta.frontmatterId)) {
          issues.push({
            code: 'DUPLICATE_ID',
            path: file.path,
            message: `Id ${meta.frontmatterId} is also used by ${byId.get(meta.frontmatterId)?.path}`,
          });
        } else {
          id = meta.frontmatterId;
        }
      }
      const entry: DocumentEntry = {
        id: id ?? provisionalId(file.path),
        idSource: id ? 'frontmatter' : 'provisional',
        path: file.path,
        title: meta.title,
        aliases: meta.aliases,
        mtimeMs: cached.mtimeMs,
        size: cached.size,
      };
      if (meta.analysisLimited) entry.analysisLimited = meta.analysisLimited;
      byId.set(entry.id, entry);
    }

    await this.syncIndex(byId, fresh);
    for (const issue of issues) this.options.logger.warn({ issue }, 'Content scan issue');
    const folders = [
      ...new Set([...this.folderPaths.filter((folder) => !affected(folder)), ...scan.folders]),
    ].sort();
    const changes = diffContent(this.byId, byId, this.folderPaths, folders, this.cache, nextCache);
    this.cache = nextCache;
    this.byId = byId;
    this.folderPaths = folders;
    this.currentIssues = issues;
    this.lastAnalysis = undefined;
    return changes;
  }

  private readonly analyseBody = async (body: string): Promise<AnalysisResult> => {
    if (this.lastAnalysis?.body === body) return this.lastAnalysis.result;
    const result = await this.analyser.analyse(body);
    this.lastAnalysis = { body, result };
    return result;
  };

  private needsId(meta: FileMeta): boolean {
    return (
      this.options.assignMissingIds &&
      meta.hasValidFrontmatter &&
      (meta.frontmatterId === undefined || meta.frontmatterId === null)
    );
  }

  /** Writes the difference between the resolved entries and the database in one transaction. */
  private async syncIndex(
    byId: Map<string, DocumentEntry>,
    fresh: Map<string, FileContent>,
  ): Promise<void> {
    const current = new Map([...byId.values()].map((entry) => [entry.path, entry]));
    const remove = [...this.indexed.keys()].filter((p) => !current.has(p));
    const upsert: IndexRecord[] = [];
    for (const entry of current.values()) {
      const stored = this.indexed.get(entry.path);
      const unchanged = stored?.id === entry.id && stored.idSource === entry.idSource;
      if (unchanged && !fresh.has(entry.path)) continue;
      // Only the resolved id changed (e.g. a duplicate went away): the content must be re-read.
      let content = fresh.get(entry.path);
      if (!content) {
        const file = await this.statFile(entry.path);
        content = file && (await this.readFile(file)).content;
      }
      if (content) upsert.push({ ...content, id: entry.id, idSource: entry.idSource });
      else remove.push(entry.path);
    }
    if (remove.length === 0 && upsert.length === 0) return;
    this.store.apply(remove, upsert);
    for (const p of remove) this.indexed.delete(p);
    for (const record of upsert)
      this.indexed.set(record.path, { id: record.id, idSource: record.idSource });
  }

  private async statFile(relativePath: string): Promise<ScannedFile | undefined> {
    // A cached duplicate may have changed outside this event batch. Validate every ancestor again
    // before rereading it; never follow a file or directory symlink while reassigning its index id.
    const scan = await scanContentPaths(this.contentDir, [relativePath]);
    return scan.files.find((file) => file.path === relativePath);
  }

  private async readFile(
    file: ScannedFile,
  ): Promise<{ entry: CacheEntry; content: FileContent | undefined }> {
    try {
      const bytes = await readFile(file.absolutePath);
      return await analyse(this.analyseBody, bytes, file.path, file.mtimeMs, file.size);
    } catch (error) {
      return {
        entry: {
          mtimeMs: file.mtimeMs,
          size: file.size,
          meta: undefined,
          readError: error instanceof Error ? error.message : String(error),
        },
        content: undefined,
      };
    }
  }

  /** D-10: add only the missing required fields; everything else stays byte-for-byte. */
  private async assignId(
    file: ScannedFile,
    read: { entry: CacheEntry; content: FileContent | undefined },
    issues: ScanIssue[],
  ): Promise<{ entry: CacheEntry; content: FileContent | undefined }> {
    try {
      const source = await readFile(file.absolutePath, 'utf8');
      const parsed = parseFile(source);
      if (parsed.error || (parsed.data.id !== undefined && parsed.data.id !== null)) return read;
      const created = file.birthtimeMs > 0 ? file.birthtimeMs : file.mtimeMs;
      const fields: Record<string, unknown> = { id: randomUUID() };
      if (typeof parsed.data.title !== 'string' || parsed.data.title.trim() === '') {
        fields.title = deriveTitle(
          parsed.data,
          parsed.body,
          file.path.split('/').pop() ?? file.path,
        );
      }
      if (parsed.data.created === undefined) fields.created = toIsoTimestamp(new Date(created));
      if (parsed.data.updated === undefined)
        fields.updated = toIsoTimestamp(new Date(file.mtimeMs));
      const updated = updateFileFrontmatter(source, fields);

      // Last-moment check: never overwrite a concurrent external edit (RULE 8).
      const latest = await stat(file.absolutePath);
      if (latest.mtimeMs !== file.mtimeMs || latest.size !== file.size) return read;
      await atomicWriteFile(file.absolutePath, updated);
      const after = await stat(file.absolutePath);
      this.options.logger.info(
        { path: file.path, fields: Object.keys(fields) },
        'Assigned missing document id',
      );
      return await analyse(
        this.analyseBody,
        Buffer.from(updated, 'utf8'),
        file.path,
        after.mtimeMs,
        after.size,
      );
    } catch (error) {
      issues.push({
        code: 'ID_ASSIGNMENT_FAILED',
        path: file.path,
        message: error instanceof Error ? error.message : String(error),
      });
      return read;
    }
  }
}

/** Differences between two registry states, matched by document id. */
function diffContent(
  before: Map<string, DocumentEntry>,
  after: Map<string, DocumentEntry>,
  foldersBefore: string[],
  foldersAfter: string[],
  cacheBefore: Map<string, CacheEntry>,
  cacheAfter: Map<string, CacheEntry>,
): ContentChanges {
  const documents: DocumentChange[] = [];
  for (const [id, entry] of after) {
    const previous = before.get(id);
    if (!previous) {
      documents.push({ kind: 'added', id, path: entry.path });
    } else if (
      previous.path !== entry.path ||
      previous.mtimeMs !== entry.mtimeMs ||
      previous.size !== entry.size ||
      cacheBefore.get(previous.path)?.contentHash !== cacheAfter.get(entry.path)?.contentHash ||
      previous.title !== entry.title ||
      previous.aliases.join('\n') !== entry.aliases.join('\n')
    ) {
      const change: DocumentChange = { kind: 'changed', id, path: entry.path };
      if (previous.path !== entry.path) change.previousPath = previous.path;
      documents.push(change);
    }
  }
  for (const [id, entry] of before)
    if (!after.has(id)) documents.push({ kind: 'removed', id, path: entry.path });
  documents.sort((a, b) => byPath(a.path, b.path));

  const known = new Set(foldersBefore);
  const current = new Set(foldersAfter);
  const folders: FolderChange[] = [
    ...foldersAfter.filter((p) => !known.has(p)).map((p) => ({ kind: 'added' as const, path: p })),
    ...foldersBefore
      .filter((p) => !current.has(p))
      .map((p) => ({ kind: 'removed' as const, path: p })),
  ].sort((a, b) => byPath(a.path, b.path));
  return { documents, folders };
}

function byPath(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Parses one file into its registry metadata and its index content. */
async function analyse(
  analyseBody: (body: string) => Promise<AnalysisResult>,
  bytes: Buffer,
  relativePath: string,
  mtimeMs: number,
  size: number,
): Promise<{ entry: CacheEntry; content: FileContent }> {
  const parsed = parseFile(bytes.toString('utf8'));
  const filename = path.posix.basename(relativePath);
  const meta: FileMeta = {
    frontmatterId: parsed.data.id,
    hasValidFrontmatter: !parsed.error,
    title: deriveTitle(parsed.data, parsed.body, filename),
    aliases: stringList(parsed.data.aliases),
  };
  if (parsed.error) meta.frontmatterError = parsed.error;
  const result = await analyseBody(parsed.body);
  // Too large or complex: still listed and searchable, with the raw text and no links.
  const analysis = result.ok ? result.analysis : { links: [], headings: [], text: parsed.body };
  if (!result.ok) meta.analysisLimited = result.reason;
  const folder = path.posix.dirname(relativePath);
  return {
    entry: { mtimeMs, size, meta, contentHash: revisionOf(bytes) },
    content: {
      path: relativePath,
      filename,
      title: meta.title,
      description: optionalString(parsed.data.description),
      createdAt: optionalString(parsed.data.created),
      updatedAt: optionalString(parsed.data.updated),
      mtimeMs,
      size,
      contentHash: revisionOf(bytes),
      frontmatterId: parsed.data.id ?? undefined,
      frontmatterError: parsed.error,
      tags: stringList(parsed.data.tags).map((tag) => tag.replace(/^#/, '')),
      aliases: meta.aliases,
      links: analysis.links,
      headings: analysis.headings,
      folder: folder === '.' ? '' : folder,
      stem: documentStem(filename),
      body: analysis.text,
      analysisLimited: meta.analysisLimited,
    },
  };
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

/** A YAML list (or a single value) as trimmed, case-insensitively unique strings. */
function stringList(value: unknown): string[] {
  const items = Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    if (typeof item !== 'string' && typeof item !== 'number') continue;
    const text = String(item).trim();
    if (text === '' || seen.has(text.toLowerCase())) continue;
    seen.add(text.toLowerCase());
    result.push(text);
  }
  return result;
}

function sortTree(folder: TreeFolderNode): void {
  const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
  folder.children.sort((a: TreeNode, b: TreeNode) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
    return collator.compare(a.name, b.name);
  });
  for (const child of folder.children) if (child.type === 'folder') sortTree(child);
}
