import { mkdir, readdir, rmdir } from 'node:fs/promises';
import path from 'node:path';
import type {
  CreateFolderRequest,
  DeleteFolderResponse,
  FolderDto,
  MoveFolderRequest,
  RenameFolderRequest,
} from '@leandocs/shared';
import type { LinkUpdater } from '../documents/link-updater.js';
import type { DocumentRegistry } from '../documents/registry.js';
import { assertVisiblePath, isHiddenEntry } from '../documents/scanner.js';
import { AppError } from '../errors.js';
import { sanitizeName } from '../filesystem/file-name.js';
import type { MutationLock } from '../filesystem/lock.js';
import { moveNoOverwrite } from '../filesystem/move.js';
import {
  normalizeRelativePath,
  resolveExistingDirectory,
  toRelativePath,
} from '../filesystem/safe-path.js';
import type { TrashService } from '../trash/trash.js';

/**
 * Folder operations (PROJECT_SPEC §11, §42). Folders on disk are the navigation tree, so every
 * operation is a real filesystem operation; documents inside keep their ids.
 */
export class FolderService {
  constructor(
    private readonly contentDir: string,
    private readonly registry: DocumentRegistry,
    private readonly trash: TrashService,
    private readonly lock: MutationLock,
    private readonly links: LinkUpdater,
  ) {}

  createFolder(request: CreateFolderRequest): Promise<FolderDto> {
    return this.lock.run(async () => {
      const parent = normalizeRelativePath(request.parent ?? '');
      assertVisiblePath(parent);
      const name = this.folderName(request.name, parent);
      const parentAbsolute = await resolveExistingDirectory(this.contentDir, parent);
      const target = path.join(parentAbsolute, name);
      try {
        await mkdir(target);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw folderExists(name);
        throw error;
      }
      await this.registry.refresh();
      return this.dto(target);
    });
  }

  renameFolder(request: RenameFolderRequest): Promise<FolderDto> {
    return this.lock.run(async () => {
      const { relative, absolute } = await this.existingFolder(request.path);
      const parent = parentOf(relative);
      const name = this.folderName(request.name, parent);
      const target = path.join(path.dirname(absolute), name);
      await this.move(relative, absolute, target, name);
      return this.dto(target);
    });
  }

  moveFolder(request: MoveFolderRequest): Promise<FolderDto> {
    return this.lock.run(async () => {
      const { relative, absolute } = await this.existingFolder(request.path);
      const targetParent = normalizeRelativePath(request.targetFolder);
      assertVisiblePath(targetParent);
      if (targetParent === relative || targetParent.startsWith(`${relative}/`)) {
        throw new AppError(400, 'INVALID_MOVE', 'A folder cannot be moved into itself');
      }
      const targetParentAbsolute = await resolveExistingDirectory(this.contentDir, targetParent);
      const name = path.basename(absolute);
      const target = path.join(targetParentAbsolute, name);
      await this.move(relative, absolute, target, name);
      return this.dto(target);
    });
  }

  /** Empty folders are removed; folders with content go to the trash as a whole. */
  deleteFolder(folderPath: string): Promise<DeleteFolderResponse> {
    return this.lock.run(async () => {
      const { relative, absolute } = await this.existingFolder(folderPath);
      const entries = await readdir(absolute);
      if (entries.length === 0) {
        await rmdir(absolute);
        await this.registry.refresh();
        return { trashed: false };
      }
      const trashItem = await this.trash.moveToTrash({ kind: 'folder', originalPath: relative });
      await this.registry.refresh();
      return { trashed: true, trashItem };
    });
  }

  private async existingFolder(input: string): Promise<{ relative: string; absolute: string }> {
    const relative = normalizeRelativePath(input);
    if (relative === '') {
      throw new AppError(400, 'INVALID_FOLDER', 'The documentation root cannot be changed');
    }
    assertVisiblePath(relative);
    const absolute = await resolveExistingDirectory(this.contentDir, relative);
    return { relative, absolute };
  }

  private folderName(input: string, parent: string): string {
    const name = sanitizeName(input);
    if (isHiddenEntry(name, parent, true)) {
      throw new AppError(400, 'INVALID_NAME', `"${name}" is reserved for system folders`);
    }
    return name;
  }

  /** Moves the folder and updates links into and out of it (P9-05). Caller holds the lock. */
  private async move(
    relative: string,
    source: string,
    target: string,
    name: string,
  ): Promise<void> {
    if (source === target) return;
    const updateLinks = this.links.prepare([
      { from: `${relative}/`, to: `${toRelativePath(this.contentDir, target)}/`, prefix: true },
    ]);
    try {
      await moveNoOverwrite(source, target);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw folderExists(name);
      throw error;
    }
    await updateLinks();
    await this.registry.refresh();
  }

  private dto(absolute: string): FolderDto {
    const relative = toRelativePath(this.contentDir, absolute);
    return { path: relative, name: path.posix.basename(relative) };
  }
}

function folderExists(name: string): AppError {
  return new AppError(409, 'FOLDER_EXISTS', `"${name}" already exists in the target folder`);
}

function parentOf(relativePath: string): string {
  const slash = relativePath.lastIndexOf('/');
  return slash === -1 ? '' : relativePath.slice(0, slash);
}
