import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { open, readFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  CreateDocumentRequest,
  UpdatePropertiesRequest,
  DocumentDto,
  MoveDocumentRequest,
  RenameDocumentRequest,
  RestoreResponse,
  TrashItem,
  UpdateDocumentRequest,
} from '@leandocs/shared';
import { AppError } from '../errors.js';
import { atomicCreateFile, atomicWriteFile } from '../filesystem/atomic-write.js';
import {
  assetsDirFor,
  documentStem,
  sanitizeName,
  toDocumentFileName,
} from '../filesystem/file-name.js';
import type { MutationLock } from '../filesystem/lock.js';
import { moveNoOverwrite, pathExists } from '../filesystem/move.js';
import {
  ensureDirectory,
  normalizeRelativePath,
  resolveExistingDirectory,
  resolveInsideRoot,
  toRelativePath,
} from '../filesystem/safe-path.js';
import type { TrashService } from '../trash/trash.js';
import {
  BOM,
  composeFile,
  parseFile,
  setFrontmatterFields,
  toIsoTimestamp,
  updateFileFrontmatter,
} from './frontmatter.js';
import { deriveTitle, type DocumentEntry, type DocumentRegistry } from './registry.js';
import type { TemplateService } from '../templates/service.js';
import { documentMoves, type LinkUpdater } from './link-updater.js';
import { revisionOf } from './revision.js';
import { assertVisiblePath } from './scanner.js';
import type { ContentSync } from '../watcher/content-sync.js';

/**
 * Document operations. The filesystem is always written first; the registry is refreshed after
 * (RULE 7). All mutations run under the shared MutationLock. Route handlers only call this
 * service (PROJECT_SPEC §57).
 */
export class DocumentService {
  constructor(
    private readonly contentDir: string,
    private readonly registry: DocumentRegistry,
    private readonly trash: TrashService,
    private readonly lock: MutationLock,
    private readonly links: LinkUpdater,
    private readonly templates: TemplateService,
    private readonly sync: ContentSync,
  ) {}

  async getDocument(id: string): Promise<DocumentDto> {
    const { entry, source, bytes } = await this.readEntry(id);
    return toDto(entry, source, bytes);
  }

  /** The physical file, byte-for-byte (UI_SPEC §133 "Download Markdown"). */
  async getRawFile(id: string): Promise<{ fileName: string; bytes: Buffer }> {
    const { entry, bytes } = await this.readEntry(id);
    return { fileName: path.posix.basename(entry.path), bytes };
  }

  createDocument(request: CreateDocumentRequest): Promise<DocumentDto> {
    return this.lock.run(async () => {
      const fileName = toDocumentFileName(request.name);
      const folder = normalizeRelativePath(request.folder ?? '');
      assertVisiblePath(folder);
      const folderAbsolute = await resolveExistingDirectory(this.contentDir, folder);
      const target = path.join(folderAbsolute, fileName);

      const date = new Date();
      const now = toIsoTimestamp(date);
      const title = request.title?.trim() || documentStem(fileName);
      const id = randomUUID();
      if (request.template !== undefined && request.content)
        throw new AppError(400, 'VALIDATION_ERROR', 'Use either a template or content, not both');
      // P10-02: the template's own front matter keys (e.g. tags) follow the generated ones.
      const fromTemplate =
        request.template === undefined
          ? { fields: {}, body: request.content ?? '' }
          : await this.templates.instantiate(request.template, title, date);
      const rawFrontmatter = setFrontmatterFields('', {
        id,
        title,
        created: now,
        updated: now,
        ...fromTemplate.fields,
      });
      const source = composeFile({
        rawFrontmatter,
        body: fromTemplate.body,
        eol: '\n',
        bom: false,
        blankLineAfter: true,
      });

      try {
        await atomicCreateFile(target, source);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
          throw documentExists(fileName, toRelativePath(this.contentDir, target));
        }
        throw error;
      }
      await this.registry.refresh();
      return this.getDocument(id);
    });
  }

  /**
   * Edits title, description, tags and aliases in the front matter with a minimal diff
   * (UI_SPEC §115). Revision-checked like a save; a new title also updates wiki links that used
   * the old one (P9-05 machinery).
   */
  updateProperties(id: string, request: UpdatePropertiesRequest): Promise<DocumentDto> {
    return this.lock.run(async () => {
      const { entry, source, bytes } = await this.readEntry(id);
      const currentRevision = revisionOf(bytes);
      if (currentRevision !== request.expectedRevision)
        throw new AppError(409, 'DOCUMENT_CONFLICT', 'Document has changed', { currentRevision });
      if (parseFile(source).error)
        throw new AppError(
          422,
          'FRONTMATTER_INVALID',
          'The document header is invalid; fix it in the source editor first',
        );
      const fields: Record<string, unknown> = {};
      if (request.title !== undefined) {
        const title = request.title.trim();
        if (title === '') throw new AppError(400, 'INVALID_TITLE', 'Title must not be empty');
        fields.title = title;
      }
      if (request.description !== undefined)
        fields.description = request.description.trim() || undefined;
      if (request.tags !== undefined) fields.tags = propertyList(request.tags, true);
      if (request.aliases !== undefined) fields.aliases = propertyList(request.aliases, false);
      fields.updated = toIsoTimestamp(new Date());
      const retitled = typeof fields.title === 'string' && fields.title !== entry.title;
      const updateLinks = retitled
        ? this.links.prepare([], { id: entry.id, title: fields.title as string })
        : undefined;
      await atomicWriteFile(
        path.join(this.contentDir, entry.path),
        updateFileFrontmatter(source, fields),
      );
      if (updateLinks) await updateLinks();
      return this.documentAt(entry.path);
    });
  }

  /**
   * Replaces the body. Rejected with 409 DOCUMENT_CONFLICT when the file changed since the editor
   * loaded `expectedRevision` (PROJECT_SPEC §28) — changes are never overwritten silently.
   */
  updateDocument(id: string, request: UpdateDocumentRequest): Promise<DocumentDto> {
    return this.lock.run(async () => {
      const { entry, source, bytes } = await this.readEntry(id);
      const currentRevision = revisionOf(bytes);
      if (currentRevision !== request.expectedRevision) {
        throw new AppError(409, 'DOCUMENT_CONFLICT', 'Document has changed', {
          currentRevision,
        });
      }
      const parsed = parseFile(source);
      let next: string;
      if (!parsed.hasFrontmatter) {
        next = (parsed.bom ? BOM : '') + request.content;
      } else if (parsed.error) {
        // Invalid front matter is preserved verbatim; only the body changes.
        next = source.slice(0, source.length - parsed.body.length) + request.content;
      } else {
        const rawFrontmatter = setFrontmatterFields(
          parsed.rawFrontmatter,
          { updated: toIsoTimestamp(new Date()) },
          parsed.eol,
        );
        next = composeFile({
          rawFrontmatter,
          body: request.content,
          eol: parsed.eol,
          bom: parsed.bom,
          blankLineAfter: parsed.blankLineAfter,
        });
      }
      await atomicWriteFile(path.join(this.contentDir, entry.path), next);
      await this.registry.refresh();
      // Provisional ids derive from the path, so the id is stable across an update.
      return this.getDocument(entry.id);
    });
  }

  /** Renames the file (and its `.assets` folder) in place; optionally changes the title. */
  renameDocument(id: string, request: RenameDocumentRequest): Promise<DocumentDto> {
    return this.lock.run(async () => {
      const { entry, source } = await this.readEntry(id);
      const folder = parentOf(entry.path);
      let titleUpdate: string | undefined;
      if (request.title !== undefined) {
        const title = request.title.trim();
        if (title === '') throw new AppError(400, 'INVALID_TITLE', 'Title must not be empty');
        if (parseFile(source).error) {
          throw new AppError(
            422,
            'FRONTMATTER_INVALID',
            'The document header is invalid; fix it in the source editor before changing the title',
          );
        }
        titleUpdate = title;
      }
      const fileName = toDocumentFileName(request.name);
      // Plan link updates before the move (P9-05): the index still knows the old paths.
      const updateLinks = this.links.prepare(
        documentMoves(entry.path, folder ? `${folder}/${fileName}` : fileName),
        titleUpdate === undefined ? undefined : { id: entry.id, title: titleUpdate },
      );
      const target = await this.relocate(entry, folder, fileName, false);
      if (target !== entry.path || titleUpdate !== undefined) await updateLinks();
      if (titleUpdate !== undefined) {
        const absolute = path.join(this.contentDir, target);
        const current = await readFile(absolute, 'utf8');
        const next = updateFileFrontmatter(current, { title: titleUpdate });
        if (next !== current) await atomicWriteFile(absolute, next);
      }
      return this.documentAt(target);
    });
  }

  /** Moves the file (and its `.assets` folder) to another folder; never overwrites. */
  moveDocument(id: string, request: MoveDocumentRequest): Promise<DocumentDto> {
    return this.lock.run(async () => {
      const { entry } = await this.readEntry(id);
      const fileName = path.posix.basename(entry.path);
      const folder = normalizeRelativePath(request.folder);
      const updateLinks = this.links.prepare(
        documentMoves(entry.path, folder ? `${folder}/${fileName}` : fileName),
      );
      const target = await this.relocate(entry, folder, fileName, request.createFolders ?? false);
      if (target !== entry.path) await updateLinks();
      return this.documentAt(target);
    });
  }

  /** Moves the document and its attachments to the trash (PROJECT_SPEC §38). */
  trashDocument(id: string): Promise<TrashItem> {
    return this.lock.run(async () => {
      const { entry } = await this.readEntry(id);
      const assetsPath = assetsDirFor(entry.path);
      const request: Parameters<TrashService['moveToTrash']>[0] = {
        kind: 'document',
        originalPath: entry.path,
        title: entry.title,
      };
      if (entry.idSource === 'frontmatter') request.documentId = entry.id;
      if (await pathExists(path.join(this.contentDir, assetsPath))) request.assetsPath = assetsPath;
      const item = await this.trash.moveToTrash(request);
      await this.registry.refresh();
      return item;
    });
  }

  /** Restores the most recently trashed copy of a document (alias of trash restore by id). */
  async restoreDocument(id: string): Promise<RestoreResponse> {
    const item = (await this.trash.list()).find(
      (candidate) => candidate.kind === 'document' && candidate.documentId === id,
    );
    if (!item) throw new AppError(404, 'TRASH_ITEM_NOT_FOUND', 'Document is not in the trash');
    return this.restoreTrashItem(item.trashId);
  }

  restoreTrashItem(trashId: string): Promise<RestoreResponse> {
    return this.lock.run(async () => {
      const restored = await this.trash.restore(trashId);
      await this.registry.refresh();
      const response: RestoreResponse = { kind: restored.kind, path: restored.path };
      if (restored.kind === 'document') {
        const entry = this.registry.findByPath(restored.path);
        if (entry) response.documentId = entry.id;
      }
      return response;
    });
  }

  deleteTrashItem(trashId: string): Promise<void> {
    return this.lock.run(() => this.trash.remove(trashId));
  }

  emptyTrash(): Promise<number> {
    return this.lock.run(() => this.trash.empty());
  }

  /**
   * Moves a document file plus its `.assets` folder to `folder/fileName`. Returns the new
   * relative path. Rolls the file back if the assets folder cannot follow. Caller holds the lock.
   */
  private async relocate(
    entry: DocumentEntry,
    folder: string,
    fileName: string,
    createFolders: boolean,
  ): Promise<string> {
    assertVisiblePath(folder);
    const folderAbsolute = createFolders
      ? await ensureDirectory(this.contentDir, folder, (segment) => {
          if (sanitizeName(segment) !== segment) {
            throw new AppError(400, 'INVALID_NAME', `Invalid folder name: "${segment}"`);
          }
        })
      : await resolveExistingDirectory(this.contentDir, folder);
    const source = path.join(this.contentDir, entry.path);
    const target = path.join(folderAbsolute, fileName);
    const targetRelative = toRelativePath(this.contentDir, target);
    if (target === source) return entry.path;

    const sourceAssets = assetsDirFor(source);
    const targetAssets = assetsDirFor(target);
    const hasAssets = await pathExists(sourceAssets);
    const caseOnlyRename = source.toLowerCase() === target.toLowerCase();
    if (hasAssets && !caseOnlyRename && (await pathExists(targetAssets))) {
      throw documentExists(
        path.basename(targetAssets),
        toRelativePath(this.contentDir, targetAssets),
      );
    }
    try {
      await moveNoOverwrite(source, target);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        throw documentExists(fileName, targetRelative);
      }
      throw error;
    }
    if (hasAssets) {
      try {
        await moveNoOverwrite(sourceAssets, targetAssets);
      } catch (error) {
        await moveNoOverwrite(target, source).catch(() => undefined);
        throw error;
      }
    }
    return targetRelative;
  }

  private async documentAt(relativePath: string): Promise<DocumentDto> {
    await this.registry.refresh();
    const entry = this.registry.findByPath(relativePath);
    if (!entry) throw notFound();
    return this.getDocument(entry.id);
  }

  /** Reads a document by id; refreshes the registry once if the id or file is unknown/missing. */
  private async readEntry(
    id: string,
  ): Promise<{ entry: DocumentEntry; source: string; bytes: Buffer }> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const entry = this.registry.get(id);
      if (entry) {
        try {
          await resolveExistingDirectory(this.contentDir, parentOf(entry.path));
          const handle = await open(
            resolveInsideRoot(this.contentDir, entry.path),
            constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
          );
          try {
            if (!(await handle.stat()).isFile()) throw notFound();
            const bytes = await handle.readFile();
            return { entry, source: bytes.toString('utf8'), bytes };
          } finally {
            await handle.close();
          }
        } catch (error) {
          if (!['ENOENT', 'ELOOP'].includes((error as NodeJS.ErrnoException).code ?? ''))
            throw error;
        }
      }
      // Inside a mutation this is the mutation's own refresh; on a read it reports external changes.
      if (attempt === 0) await this.sync.refresh();
    }
    throw notFound();
  }
}

function notFound(): AppError {
  return new AppError(404, 'DOCUMENT_NOT_FOUND', 'Document not found');
}

function documentExists(name: string, relativePath: string): AppError {
  return new AppError(409, 'DOCUMENT_EXISTS', `"${name}" already exists in the target folder`, {
    path: relativePath,
  });
}

function parentOf(relativePath: string): string {
  const slash = relativePath.lastIndexOf('/');
  return slash === -1 ? '' : relativePath.slice(0, slash);
}

function toDto(entry: DocumentEntry, source: string, bytes: Buffer): DocumentDto {
  const parsed = parseFile(source);
  const fileName = path.posix.basename(entry.path);
  const dto: DocumentDto = {
    id: entry.id,
    title: deriveTitle(parsed.data, parsed.body, fileName),
    path: entry.path,
    content: parsed.body,
    frontmatter: parsed.data,
    revision: revisionOf(bytes),
    created: typeof parsed.data.created === 'string' ? parsed.data.created : null,
    updated: typeof parsed.data.updated === 'string' ? parsed.data.updated : null,
  };
  if (parsed.error) dto.frontmatterError = parsed.error;
  return dto;
}

/** Trimmed, de-duplicated (case-insensitively) list; `undefined` (removes the key) when empty. */
function propertyList(values: string[], isTag: boolean): string[] | undefined {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of values) {
    const value = (isTag ? raw.replace(/^#/, '') : raw).trim();
    if (!value || seen.has(value.toLowerCase())) continue;
    seen.add(value.toLowerCase());
    result.push(value);
  }
  return result.length > 0 ? result : undefined;
}
