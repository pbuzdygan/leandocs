import { randomBytes } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import type { TrashItem } from '@leandocs/shared';
import { AppError } from '../errors.js';
import { atomicWriteFile } from '../filesystem/atomic-write.js';
import { moveNoOverwrite, pathExists } from '../filesystem/move.js';
import {
  ensureDirectory,
  resolveExistingDirectory,
  UnsafePathError,
  normalizeRelativePath,
  resolveInsideRoot,
} from '../filesystem/safe-path.js';
import { toIsoTimestamp } from '../documents/frontmatter.js';
import { assertVisiblePath } from '../documents/scanner.js';
import { sanitizeName } from '../filesystem/file-name.js';

/**
 * Trash (PROJECT_SPEC §38). Deleted items are moved — never destroyed — into
 *
 *   content/_trash/<trashId>/<original name>          (+ `<name>.assets/` for documents)
 *   content/_trash/<trashId>/.leandocs-trash.json      (restore metadata)
 *
 * `_trash` is a system folder: hidden from the tree and never indexed. Everything stays a plain
 * file, so a user can also recover items by hand.
 */

export const TRASH_FOLDER = '_trash';
const META_FILE = '.leandocs-trash.json';
const TRASH_ID = /^[0-9]{8}T[0-9]{6}Z-[0-9a-f]{8}$/;

interface TrashMeta {
  version: 1;
  kind: 'document' | 'folder';
  name: string;
  originalPath: string;
  deletedAt: string;
  documentId?: string;
  title?: string;
  /** Name of the attachments folder stored next to the document, if any. */
  assetsName?: string;
}

export interface TrashRequest {
  kind: 'document' | 'folder';
  /** Relative path of the document or folder being deleted. */
  originalPath: string;
  /** Attachments folder that belongs to a document (relative path), if it exists. */
  assetsPath?: string;
  documentId?: string;
  title?: string;
}

export class TrashService {
  private readonly trashDir: string;

  constructor(private readonly contentDir: string) {
    this.trashDir = path.join(contentDir, TRASH_FOLDER);
  }

  async moveToTrash(request: TrashRequest): Promise<TrashItem> {
    const now = new Date();
    const trashId = `${toIsoTimestamp(now).replace(/[-:]/g, '')}-${randomBytes(4).toString('hex')}`;
    const itemDir = path.join(this.trashDir, trashId);
    const name = path.posix.basename(request.originalPath);
    const meta: TrashMeta = {
      version: 1,
      kind: request.kind,
      name,
      originalPath: request.originalPath,
      deletedAt: toIsoTimestamp(now),
    };
    if (request.documentId) meta.documentId = request.documentId;
    if (request.title) meta.title = request.title;
    if (request.assetsPath) meta.assetsName = path.posix.basename(request.assetsPath);

    if (!(await this.safeTrashDirectory())) {
      await mkdir(this.trashDir);
      await this.safeTrashDirectory();
    }
    // Metadata first: if anything fails later, the item is still identifiable on disk.
    await mkdir(itemDir);
    await atomicWriteFile(path.join(itemDir, META_FILE), `${JSON.stringify(meta, null, 2)}\n`);
    const source = resolveInsideRoot(this.contentDir, request.originalPath);
    try {
      await moveNoOverwrite(source, path.join(itemDir, name));
    } catch (error) {
      await rm(itemDir, { recursive: true, force: true });
      throw error;
    }
    if (request.assetsPath && meta.assetsName) {
      const assets = resolveInsideRoot(this.contentDir, request.assetsPath);
      if (await pathExists(assets))
        await moveNoOverwrite(assets, path.join(itemDir, meta.assetsName));
    }
    return toItem(trashId, meta);
  }

  async list(): Promise<TrashItem[]> {
    if (!(await this.safeTrashDirectory())) return [];
    const entries = await readdir(this.trashDir, { withFileTypes: true });
    const items: TrashItem[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || !TRASH_ID.test(entry.name)) continue;
      const meta = await this.readMeta(entry.name).catch(() => undefined);
      if (meta) items.push(toItem(entry.name, meta));
    }
    return items.sort((a, b) =>
      a.deletedAt < b.deletedAt ? 1 : a.deletedAt > b.deletedAt ? -1 : 0,
    );
  }

  async get(trashId: string): Promise<TrashItem> {
    return toItem(trashId, await this.requireMeta(trashId));
  }

  /**
   * Moves an item back to its original location. Missing parent folders are recreated; an existing
   * document or folder at that location is never overwritten (409 RESTORE_CONFLICT).
   */
  async restore(trashId: string): Promise<{ kind: TrashMeta['kind']; path: string }> {
    const meta = await this.requireMeta(trashId);
    const itemDir = path.join(this.trashDir, trashId);
    const originalPath = normalizeRelativePath(meta.originalPath);
    if (originalPath === '') throw new AppError(400, 'INVALID_TRASH_ITEM', 'Invalid original path');
    assertVisiblePath(
      path.posix.dirname(originalPath) === '.' ? '' : path.posix.dirname(originalPath),
    );
    const target = resolveInsideRoot(this.contentDir, originalPath);
    const assetsTarget = meta.assetsName
      ? path.join(path.dirname(target), meta.assetsName)
      : undefined;
    const assetsSource = meta.assetsName ? path.join(itemDir, meta.assetsName) : undefined;
    const hasAssets = assetsSource ? await pathExists(assetsSource) : false;

    if (
      (await pathExists(target)) ||
      (hasAssets && assetsTarget && (await pathExists(assetsTarget)))
    ) {
      throw new AppError(
        409,
        'RESTORE_CONFLICT',
        `Something named "${meta.name}" already exists at the original location`,
        { originalPath },
      );
    }
    await ensureDirectory(
      this.contentDir,
      path.posix.dirname(originalPath) === '.' ? '' : path.posix.dirname(originalPath),
      (segment) => {
        if (sanitizeName(segment) !== segment) throw new UnsafePathError('invalid restore folder');
      },
    );
    const sourceInfo = await lstat(path.join(itemDir, meta.name));
    if (
      sourceInfo.isSymbolicLink() ||
      (meta.kind === 'document' ? !sourceInfo.isFile() : !sourceInfo.isDirectory())
    )
      throw new UnsafePathError('invalid trash source');
    if (hasAssets && assetsSource) {
      const info = await lstat(assetsSource);
      if (info.isSymbolicLink() || !info.isDirectory())
        throw new UnsafePathError('invalid trash assets');
    }
    await moveNoOverwrite(path.join(itemDir, meta.name), target);
    if (hasAssets && assetsSource && assetsTarget)
      await moveNoOverwrite(assetsSource, assetsTarget);
    await rm(itemDir, { recursive: true, force: true });
    return { kind: meta.kind, path: originalPath };
  }

  /** Permanent delete — the only operation in LeanDocs that destroys content. */
  async remove(trashId: string): Promise<void> {
    await this.requireMeta(trashId);
    await rm(path.join(this.trashDir, trashId), { recursive: true, force: true });
  }

  async empty(): Promise<number> {
    const items = await this.list();
    for (const item of items) await this.remove(item.trashId);
    return items.length;
  }

  private async safeTrashDirectory(): Promise<string | undefined> {
    const info = await lstat(this.trashDir).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return undefined;
      throw error;
    });
    if (!info) return undefined;
    if (info.isSymbolicLink() || !info.isDirectory())
      throw new UnsafePathError('invalid trash root');
    return resolveExistingDirectory(this.contentDir, TRASH_FOLDER);
  }

  private async requireMeta(trashId: string): Promise<TrashMeta> {
    const meta = TRASH_ID.test(trashId)
      ? await this.readMeta(trashId).catch(() => undefined)
      : undefined;
    if (!meta) throw new AppError(404, 'TRASH_ITEM_NOT_FOUND', 'Trash item not found');
    return meta;
  }

  private async readMeta(trashId: string): Promise<TrashMeta> {
    if (!(await this.safeTrashDirectory())) throw new Error('Trash directory is missing');
    const info = await lstat(path.join(this.trashDir, trashId));
    if (info.isSymbolicLink() || !info.isDirectory())
      throw new UnsafePathError('invalid trash directory');
    const handle = await open(
      path.join(this.trashDir, trashId, META_FILE),
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    let raw: string;
    try {
      if (!(await handle.stat()).isFile()) throw new Error('Invalid trash metadata file');
      raw = await handle.readFile('utf8');
    } finally {
      await handle.close();
    }
    const meta = JSON.parse(raw) as Partial<TrashMeta>;
    if (
      meta.version !== 1 ||
      (meta.kind !== 'document' && meta.kind !== 'folder') ||
      typeof meta.name !== 'string' ||
      typeof meta.originalPath !== 'string' ||
      typeof meta.deletedAt !== 'string' ||
      !isPlainName(meta.name) ||
      (meta.assetsName !== undefined && !isPlainName(meta.assetsName))
    ) {
      throw new Error(`Invalid trash metadata in ${trashId}`);
    }
    return meta as TrashMeta;
  }
}

/** Metadata is a file on disk and could be edited by hand: names must be single path segments. */
function isPlainName(name: unknown): name is string {
  return (
    typeof name === 'string' &&
    name !== '' &&
    name !== '.' &&
    name !== '..' &&
    !name.includes('/') &&
    !name.includes('\\') &&
    !name.includes('\0')
  );
}

function toItem(trashId: string, meta: TrashMeta): TrashItem {
  const item: TrashItem = {
    trashId,
    kind: meta.kind,
    name: meta.name,
    originalPath: meta.originalPath,
    deletedAt: meta.deletedAt,
  };
  if (meta.documentId) item.documentId = meta.documentId;
  if (meta.title) item.title = meta.title;
  return item;
}
