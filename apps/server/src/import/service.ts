import { randomUUID } from 'node:crypto';
import { lstat, mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { ImportItem, ImportReport, ImporterKind } from '@leandocs/shared';
import { attachmentName, validateAttachment } from '../attachments/validation.js';
import { rewriteRelativeLinks, type PathMove } from '../documents/link-updater.js';
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
import { ImportItemError, UNUSED_FILE, type ImportEntry, type Importer } from './importer.js';
import { localReferences } from './references.js';
import { htmlImporter } from './html.js';
import { markdownDirectoryImporter } from './markdown-directory.js';

const IMPORTERS: Record<ImporterKind, Importer> = {
  'markdown-directory': markdownDirectoryImporter,
  html: htmlImporter,
};

interface PlannedDocument {
  item: ImportItem;
  /** Path inside the selection that links resolve from (the `.md` name for converted files). */
  target: string;
  /** Final file content. */
  text: string;
  attachments: { item: ImportItem; bytes: Buffer | undefined }[];
}

interface Plan {
  /** Report order: each document is followed by its attachments. */
  items: ImportItem[];
  documents: PlannedDocument[];
}

/**
 * Shared `preview` and `import` steps of every importer (PROJECT_SPEC §66, ADR-0022).
 *
 * The plan never overwrites: names that are taken get a ` (2)` suffix, folders are merged. Files
 * keep their bytes except for identity: a missing `id` (and missing `title`/`created`/`updated`,
 * as in D-10) is added, an `id` already used in the library or in the selection is replaced with
 * a warning, and invalid front matter is kept unchanged.
 *
 * Local files a document refers to are copied into its `<name>.assets/` folder and only those
 * link destinations are rewritten (P13-06), using the attachment rules of normal uploads. Links
 * between imported documents follow documents that had to be renamed.
 */
export class ImportService {
  constructor(
    private readonly contentDir: string,
    private readonly registry: DocumentRegistry,
    private readonly lock: MutationLock,
    private readonly sync: ContentSync,
    private readonly maxFileSize: number,
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
    const { items } = await this.plan(this.importer(kind), folder, entries, new Date(), true);
    return report(kind, folder, true, items, await this.newFolders(items));
  }

  import(kind: ImporterKind, destination: string, entries: readonly ImportEntry[]) {
    const folder = checkDestination(destination);
    return this.lock.run(async () => {
      // Plan again under the lock: the library may have changed since the preview.
      const plan = await this.plan(this.importer(kind), folder, entries, new Date(), false);
      const folders = await this.newFolders(plan.items);
      for (const document of plan.documents) await this.write(document);
      await this.registry.refresh();
      for (const { item } of plan.documents)
        if (item.status === 'imported') {
          const id = this.registry.findByPath(item.destination!)?.id;
          if (id) item.documentId = id;
        }
      return report(kind, folder, false, plan.items, folders);
    });
  }

  /** Writes one document, then its attachments into its new `.assets` folder. */
  private async write({ item, text, attachments }: PlannedDocument): Promise<void> {
    if (item.status !== 'ready' || item.destination === undefined) return;
    let directory: string;
    try {
      const parent = path.posix.dirname(item.destination);
      directory = await ensureDirectory(
        this.contentDir,
        parent === '.' ? '' : parent,
        (segment) => {
          if (sanitizeName(segment) !== segment) throw new InvalidNameError(segment);
        },
      );
      await atomicCreateFile(path.join(directory, path.posix.basename(item.destination)), text);
      item.status = 'imported';
    } catch (error) {
      item.status = 'failed';
      item.reason = writeFailure(error);
      for (const attachment of attachments) {
        attachment.item.status = 'failed';
        attachment.item.reason = 'The document was not imported';
      }
      return;
    }
    if (attachments.length === 0) return;
    const assets = path.join(directory, path.posix.basename(assetsDirFor(item.destination)));
    try {
      // The plan checked that this folder did not exist, so it belongs to the new document.
      await mkdir(assets);
    } catch (error) {
      for (const attachment of attachments) {
        attachment.item.status = 'failed';
        attachment.item.reason = writeFailure(error);
      }
      return;
    }
    for (const attachment of attachments) {
      try {
        await atomicCreateFile(
          path.join(assets, path.posix.basename(attachment.item.destination!)),
          attachment.bytes!,
        );
        attachment.item.status = 'imported';
      } catch (error) {
        attachment.item.status = 'failed';
        attachment.item.reason = writeFailure(error);
      }
    }
  }

  private async plan(
    importer: Importer,
    destination: string,
    entries: readonly ImportEntry[],
    now: Date,
    dryRun: boolean,
  ): Promise<Plan> {
    if (!importer.detect(entries))
      throw new AppError(
        400,
        'IMPORT_UNSUPPORTED',
        importer.kind === 'html'
          ? 'No HTML files were found in the selection'
          : 'No Markdown files were found in the selection',
      );
    const claimedPaths = new Set<string>();
    const claimedIds = new Set<string>();
    const order: (ImportItem | PlannedDocument)[] = [];
    const documents: PlannedDocument[] = [];
    for (const scanned of importer.scan(entries)) {
      if (scanned.kind === 'skipped') {
        order.push(skipped(scanned.source, scanned.reason));
        continue;
      }
      const item: ImportItem = { source: scanned.source, status: 'ready', notes: [], warnings: [] };
      try {
        const target = await this.placement(destination, scanned.target, claimedPaths, item);
        const converted = importer.convert(scanned);
        if (converted.converted) item.converted = true;
        item.notes.push(...converted.notes);
        item.warnings.push(...converted.warnings);
        const text = this.identify(converted.text, target, claimedIds, item, now);
        item.destination = target;
        const document = { item, target: scanned.target, text, attachments: [] };
        documents.push(document);
        order.push(document);
      } catch (error) {
        if (!(error instanceof ImportItemError)) throw error;
        item.status = 'skipped';
        item.reason = error.message;
        order.push(item);
      }
    }

    const { used, problems } = await this.attach(importer, destination, documents, entries, dryRun);
    const items: ImportItem[] = [];
    for (const entry of order) {
      if ('target' in entry) items.push(entry.item, ...entry.attachments.map((a) => a.item));
      else if (!(entry.status === 'skipped' && used.has(entry.source))) {
        const problem = problems.get(entry.source);
        if (problem && entry.reason === UNUSED_FILE)
          entry.reason = `Cannot be attached: ${problem}`;
        items.push(entry);
      }
    }
    return { items, documents };
  }

  /**
   * Plans the attachments of every document and rewrites the link destinations that change.
   * Returns the selection paths used as attachments and why other referenced files cannot be.
   */
  private async attach(
    importer: Importer,
    destination: string,
    documents: PlannedDocument[],
    entries: readonly ImportEntry[],
    dryRun: boolean,
  ): Promise<{ used: Set<string>; problems: Map<string, string> }> {
    const byPath = new Map(entries.map((entry) => [entry.path, entry]));
    const byLowerPath = new Map<string, ImportEntry>();
    for (const entry of entries)
      if (!byLowerPath.has(entry.path.toLowerCase()))
        byLowerPath.set(entry.path.toLowerCase(), entry);
    const documentTargets = new Set(documents.map((document) => document.target.toLowerCase()));
    // Documents that could not keep their name: links from other imported documents follow them.
    const renames: PathMove[] = documents
      .filter(({ item, target }) => item.destination !== joinPath(destination, target))
      .map(({ item, target }) => ({ from: target, to: item.destination!, prefix: false }));
    const used = new Set<string>();
    const problems = new Map<string, string>();

    for (const document of documents) {
      const { item, target } = document;
      const parsed = parseFile(document.text);
      const head = document.text.slice(0, document.text.length - parsed.body.length);
      const moves = [...renames];
      const names = new Set<string>();
      const missing: string[] = [];
      for (const reference of localReferences(parsed.body, target)) {
        if (documentTargets.has(reference.toLowerCase())) continue;
        const entry = byPath.get(reference) ?? byLowerPath.get(reference.toLowerCase());
        if (!entry) {
          if (!/\.md$/i.test(reference)) missing.push(reference);
          continue;
        }
        if (importer.reads(entry.path)) continue;
        const name = attachmentNameOrUndefined(path.posix.basename(entry.path));
        const problem =
          name === undefined
            ? 'this file type cannot be attached'
            : await this.attachmentProblem(name, entry, dryRun);
        if (problem !== undefined) {
          problems.set(entry.path, problem);
          item.warnings.push(`Kept the link to ${entry.path}: ${problem}`);
          continue;
        }
        const unique = uniqueName(name!, names);
        const assetPath = `${assetsDirFor(item.destination!)}/${unique}`;
        moves.push({ from: reference, to: assetPath, prefix: false });
        document.attachments.push({
          item: {
            source: entry.path,
            destination: assetPath,
            status: 'ready',
            attachmentOf: item.source,
            notes: [],
            warnings: [],
          },
          bytes: entry.bytes,
        });
        used.add(entry.path);
      }
      if (missing.length > 0)
        item.warnings.push(
          `Linked ${missing.length === 1 ? 'file is' : 'files are'} not in the selection, so the ${missing.length === 1 ? 'link was' : 'links were'} kept: ${missing.join(', ')}`,
        );
      if (document.attachments.length > 0)
        item.notes.push(
          `Copies ${document.attachments.length === 1 ? '1 attachment' : `${document.attachments.length} attachments`} next to the document and updates the links`,
        );
      if (moves.length > 0)
        document.text =
          head + rewriteRelativeLinks(parsed.body, target, item.destination!, moves, () => false);
    }
    return { used, problems };
  }

  /** The upload rules of normal attachments; content checks need the bytes (sent on import). */
  private async attachmentProblem(
    name: string,
    entry: ImportEntry,
    dryRun: boolean,
  ): Promise<string | undefined> {
    if (entry.tooLarge)
      return `larger than the ${Math.floor(this.maxFileSize / 1024 / 1024)} MiB upload limit`;
    if (!entry.bytes) return dryRun ? undefined : 'the file content was not sent';
    try {
      await validateAttachment(name, entry.mime ?? '', entry.bytes, this.maxFileSize);
      return undefined;
    } catch (error) {
      const message = error instanceof AppError ? error.message : 'the file is not valid';
      return message.charAt(0).toLowerCase() + message.slice(1);
    }
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
            `A document named "${fileName}" already exists; imported as "${name}"`,
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
      if (item.status !== 'ready' || !item.destination || item.attachmentOf) continue;
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

function joinPath(folder: string, relative: string): string {
  return folder ? `${folder}/${relative}` : relative;
}

function attachmentNameOrUndefined(fileName: string): string | undefined {
  try {
    return attachmentName(fileName);
  } catch {
    return undefined;
  }
}

/** `diagram.png`, then `diagram-2.png`… within one `.assets` folder (case-insensitive). */
function uniqueName(name: string, taken: Set<string>): string {
  const extension = path.posix.extname(name);
  const stem = name.slice(0, name.length - extension.length);
  for (let attempt = 1; ; attempt++) {
    const candidate = attempt === 1 ? name : `${stem}-${attempt}${extension}`;
    if (!taken.has(candidate.toLowerCase())) {
      taken.add(candidate.toLowerCase());
      return candidate;
    }
  }
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
  const documents = items.filter((item) => !item.attachmentOf);
  const attachments = items.filter((item) => item.attachmentOf);
  const count = (list: ImportItem[], status: ImportItem['status']) =>
    list.filter((item) => item.status === status).length;
  return {
    importer,
    destination,
    dryRun,
    items,
    summary: {
      documents: count(documents, dryRun ? 'ready' : 'imported'),
      attachments: count(attachments, dryRun ? 'ready' : 'imported'),
      folders,
      skipped: count(items, 'skipped'),
      failed: count(items, 'failed'),
      warnings: items.reduce((total, item) => total + item.warnings.length, 0),
    },
  };
}
