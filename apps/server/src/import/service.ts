import { randomUUID } from 'node:crypto';
import { lstat } from 'node:fs/promises';
import path from 'node:path';
import type { ImportItem, ImportReport, ImporterKind } from '@leandocs/shared';
import { AppError } from '../errors.js';
import { atomicCreateFile } from '../filesystem/atomic-write.js';
import {
  assetsDirFor,
  documentStem,
  InvalidNameError,
  sanitizeName,
  toDocumentFileName,
} from '../filesystem/file-name.js';
import type { MutationLock } from '../filesystem/lock.js';
import { ensureDirectory, normalizeRelativePath } from '../filesystem/safe-path.js';
import { parseFile, toIsoTimestamp, updateFileFrontmatter } from '../documents/frontmatter.js';
import { deriveTitle, isValidDocumentId, type DocumentRegistry } from '../documents/registry.js';
import { assertVisiblePath } from '../documents/scanner.js';
import type { ContentSync } from '../watcher/content-sync.js';
import { ImportItemError, type ImportEntry, type Importer } from './importer.js';
import { markdownDirectoryImporter } from './markdown-directory.js';

const IMPORTERS: Record<ImporterKind, Importer> = {
  'markdown-directory': markdownDirectoryImporter,
};

interface Plan {
  items: ImportItem[];
  /** Final file content of each `ready` item. */
  texts: Map<ImportItem, string>;
}

/**
 * Shared `preview` and `import` steps of every importer (PROJECT_SPEC §66, ADR-0022).
 *
 * The plan never overwrites: names that are taken get a ` (2)` suffix, folders are merged. Files
 * keep their bytes except for identity: a missing `id` (and missing `title`/`created`/`updated`,
 * as in D-10) is added, an `id` already used in the library or in the selection is replaced with
 * a warning, and invalid front matter is kept unchanged.
 */
export class ImportService {
  constructor(
    private readonly contentDir: string,
    private readonly registry: DocumentRegistry,
    private readonly lock: MutationLock,
    private readonly sync: ContentSync,
  ) {}

  importer(kind: ImporterKind): Importer {
    return IMPORTERS[kind];
  }

  async preview(
    kind: ImporterKind,
    destination: string,
    entries: readonly ImportEntry[],
  ): Promise<ImportReport> {
    await this.sync.ensureFresh();
    const folder = checkDestination(destination);
    const { items } = await this.plan(this.importer(kind), folder, entries, new Date());
    return report(kind, folder, true, items, await this.newFolders(items));
  }

  import(kind: ImporterKind, destination: string, entries: readonly ImportEntry[]) {
    const folder = checkDestination(destination);
    return this.lock.run(async () => {
      // Plan again under the lock: the library may have changed since the preview.
      const { items, texts } = await this.plan(this.importer(kind), folder, entries, new Date());
      const folders = await this.newFolders(items);
      for (const item of items) {
        if (item.status !== 'ready' || item.destination === undefined) continue;
        try {
          const parent = path.posix.dirname(item.destination);
          const directory = await ensureDirectory(
            this.contentDir,
            parent === '.' ? '' : parent,
            (segment) => {
              if (sanitizeName(segment) !== segment) throw new InvalidNameError(segment);
            },
          );
          await atomicCreateFile(
            path.join(directory, path.posix.basename(item.destination)),
            texts.get(item)!,
          );
          item.status = 'imported';
        } catch (error) {
          item.status = 'failed';
          item.reason = writeFailure(error);
        }
      }
      await this.registry.refresh();
      for (const item of items)
        if (item.status === 'imported') {
          const id = this.registry.findByPath(item.destination!)?.id;
          if (id) item.documentId = id;
        }
      return report(kind, folder, false, items, folders);
    });
  }

  private async plan(
    importer: Importer,
    destination: string,
    entries: readonly ImportEntry[],
    now: Date,
  ): Promise<Plan> {
    if (!importer.detect(entries))
      throw new AppError(
        400,
        'IMPORT_UNSUPPORTED',
        'No Markdown files were found in the selection',
      );
    const claimedPaths = new Set<string>();
    const claimedIds = new Set<string>();
    const items: ImportItem[] = [];
    const texts = new Map<ImportItem, string>();
    for (const scanned of importer.scan(entries)) {
      if (scanned.kind === 'skipped') {
        items.push(skipped(scanned.source, scanned.reason));
        continue;
      }
      const item: ImportItem = { source: scanned.source, status: 'ready', notes: [], warnings: [] };
      items.push(item);
      try {
        const target = await this.placement(destination, scanned.target, claimedPaths, item);
        const converted = importer.convert(scanned);
        item.notes.push(...converted.notes);
        item.warnings.push(...converted.warnings);
        texts.set(item, this.identify(converted.text, target, claimedIds, item, now));
        item.destination = target;
      } catch (error) {
        if (!(error instanceof ImportItemError)) throw error;
        item.status = 'skipped';
        item.reason = error.message;
      }
    }
    return { items, texts };
  }

  /** Sanitised, non-overwriting target path; records renames as warnings. */
  private async placement(
    destination: string,
    target: string,
    claimed: Set<string>,
    item: ImportItem,
  ): Promise<string> {
    const segments = target.split('/');
    let folders: string[];
    let fileName: string;
    try {
      folders = segments.slice(0, -1).map((segment) => sanitizeName(segment));
      fileName = toDocumentFileName(segments.at(-1)!);
    } catch (error) {
      throw new ImportItemError(
        error instanceof InvalidNameError ? error.message : 'The name cannot be used',
      );
    }
    const folder = [destination, ...folders].filter(Boolean).join('/');
    if (destination === '' && folders[0]?.startsWith('_'))
      throw new ImportItemError(
        'Top-level folders starting with "_" are reserved; choose a destination folder',
      );
    const wanted = [...folders, fileName].join('/');
    if (wanted !== target) item.warnings.push(`Renamed to a safe name: ${wanted}`);
    for (let attempt = 1; ; attempt++) {
      const name = attempt === 1 ? fileName : `${documentStem(fileName)} (${attempt}).md`;
      const candidate = folder ? `${folder}/${name}` : name;
      if (
        !claimed.has(candidate) &&
        !(await this.exists(candidate)) &&
        !(await this.exists(assetsDirFor(candidate)))
      ) {
        claimed.add(candidate);
        if (attempt > 1)
          item.warnings.push(
            `A document named "${fileName}" already exists; imported as "${name}". Links to the original name need updating`,
          );
        return candidate;
      }
      if (attempt >= 1000) throw new ImportItemError('Unable to choose a unique file name');
    }
  }

  /** Does not follow symlinks. A file where a folder is expected fails when the item is written. */
  private exists(relative: string): Promise<boolean> {
    return lstat(path.join(this.contentDir, relative)).then(
      () => true,
      (error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return false;
        throw error;
      },
    );
  }

  /** Adds or replaces only what identity needs; everything else stays byte-for-byte. */
  private identify(
    text: string,
    target: string,
    claimed: Set<string>,
    item: ImportItem,
    now: Date,
  ): string {
    const parsed = parseFile(text);
    if (parsed.error) {
      item.warnings.push(
        'The front matter is invalid, so the file is imported unchanged; fix it to give the document a permanent id',
      );
      return text;
    }
    const id = parsed.data.id;
    const fields: Record<string, unknown> = {};
    if (id === undefined || id === null || id === '') {
      fields.id = randomUUID();
      if (typeof parsed.data.title !== 'string' || parsed.data.title.trim() === '')
        fields.title = deriveTitle(parsed.data, parsed.body, path.posix.basename(target));
      if (parsed.data.created === undefined) fields.created = toIsoTimestamp(now);
      if (parsed.data.updated === undefined) fields.updated = toIsoTimestamp(now);
      item.notes.push(`Adds missing front matter: ${Object.keys(fields).join(', ')}`);
    } else if (!isValidDocumentId(id)) {
      item.warnings.push(
        'The document id is not usable, so the file is imported unchanged with a temporary id',
      );
      return text;
    } else if (claimed.has(id) || this.registry.get(id)) {
      fields.id = randomUUID();
      item.warnings.push(
        claimed.has(id)
          ? 'Another file in this import has the same document id; a new id is assigned'
          : 'The document id is already used in the library; a new id is assigned',
      );
    }
    claimed.add((fields.id as string | undefined) ?? (id as string));
    return Object.keys(fields).length > 0 ? updateFileFrontmatter(text, fields) : text;
  }

  /** Folders the plan creates (for the summary); computed before writing. */
  private async newFolders(items: readonly ImportItem[]): Promise<number> {
    const folders = new Set<string>();
    for (const item of items) {
      if (item.status !== 'ready' || !item.destination) continue;
      const segments = item.destination.split('/').slice(0, -1);
      for (let index = 1; index <= segments.length; index++)
        folders.add(segments.slice(0, index).join('/'));
    }
    let created = 0;
    for (const folder of folders) if (!(await this.exists(folder))) created++;
    return created;
  }
}

function checkDestination(destination: string): string {
  const folder = normalizeRelativePath(destination);
  assertVisiblePath(folder);
  for (const segment of folder === '' ? [] : folder.split('/'))
    if (sanitizeName(segment) !== segment)
      throw new AppError(400, 'INVALID_NAME', `Invalid folder name: "${segment}"`);
  return folder;
}

function skipped(source: string, reason: string): ImportItem {
  return { source, status: 'skipped', reason, notes: [], warnings: [] };
}

function writeFailure(error: unknown): string {
  if ((error as NodeJS.ErrnoException).code === 'EEXIST')
    return 'A file with this name appeared during the import; nothing was overwritten';
  if (error instanceof AppError) return error.message;
  return 'The file could not be written';
}

function report(
  importer: ImporterKind,
  destination: string,
  dryRun: boolean,
  items: ImportItem[],
  folders: number,
): ImportReport {
  const count = (status: ImportItem['status']) =>
    items.filter((item) => item.status === status).length;
  return {
    importer,
    destination,
    dryRun,
    items,
    summary: {
      documents: count(dryRun ? 'ready' : 'imported'),
      folders,
      skipped: count('skipped'),
      failed: count('failed'),
      warnings: items.reduce((total, item) => total + item.warnings.length, 0),
    },
  };
}
