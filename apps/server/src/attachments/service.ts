import { constants } from 'node:fs';
import { lstat, mkdir, open, readdir, realpath, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { API_BASE_PATH, encodePathSegment, type AttachmentDto } from '@leandocs/shared';
import type { DocumentRegistry } from '../documents/registry.js';
import { AppError } from '../errors.js';
import { atomicCreateFile } from '../filesystem/atomic-write.js';
import { assetsDirFor } from '../filesystem/file-name.js';
import type { MutationLock } from '../filesystem/lock.js';
import { resolveExistingDirectory, resolveInsideRoot } from '../filesystem/safe-path.js';
import { attachmentName, ATTACHMENT_TYPES, validateAttachment } from './validation.js';

export class AttachmentService {
  constructor(
    private readonly root: string,
    private readonly registry: DocumentRegistry,
    private readonly lock: MutationLock,
    private readonly limit: number,
  ) {}

  upload(id: string, originalName: string, mime: string, bytes: Buffer): Promise<AttachmentDto> {
    return this.lock.run(async () => {
      const name = attachmentName(originalName);
      await validateAttachment(name, mime, bytes, this.limit);
      const { folder, relative } = await this.directory(id, true);
      for (let attempt = 0; attempt < 8; attempt++) {
        const candidate =
          attempt === 0
            ? name
            : `${path.parse(name).name}-${randomBytes(4).toString('hex')}${path.extname(name)}`;
        try {
          await atomicCreateFile(path.join(folder, candidate), bytes);
          return this.dto(id, relative, candidate, bytes.length);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        }
      }
      throw new AppError(409, 'ATTACHMENT_EXISTS', 'Unable to choose a unique attachment name');
    });
  }

  list(id: string): Promise<AttachmentDto[]> {
    return this.lock.run(async () => {
      const { folder, relative } = await this.directory(id, false);
      const names = await readdir(folder).catch((error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return [];
        throw error;
      });
      const items: AttachmentDto[] = [];
      for (const name of names.sort()) {
        if (name.startsWith('.') || !ATTACHMENT_TYPES[path.extname(name).toLowerCase()]) continue;
        const info = await lstat(path.join(folder, name));
        if (info.isFile() && !info.isSymbolicLink())
          items.push(this.dto(id, relative, name, info.size));
      }
      return items;
    });
  }

  get(id: string, name: string): Promise<{ item: AttachmentDto; bytes: Buffer }> {
    return this.lock.run(async () => {
      const { folder, relative } = await this.directory(id, false);
      const target = this.target(folder, name);
      let handle;
      try {
        handle = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW);
      } catch (error) {
        if (['ENOENT', 'ELOOP'].includes((error as NodeJS.ErrnoException).code ?? ''))
          throw new AppError(404, 'ATTACHMENT_NOT_FOUND', 'Attachment not found');
        throw error;
      }
      try {
        const info = await handle.stat();
        if (!info.isFile()) throw new AppError(404, 'ATTACHMENT_NOT_FOUND', 'Attachment not found');
        if (info.size > this.limit)
          throw new AppError(
            413,
            'ATTACHMENT_TOO_LARGE',
            'Attachment exceeds the configured size limit',
          );
        const bytes = await handle.readFile();
        await validateAttachment(name, '', bytes, this.limit);
        return { item: this.dto(id, relative, name, bytes.length), bytes };
      } finally {
        await handle.close();
      }
    });
  }

  delete(id: string, name: string): Promise<void> {
    return this.lock.run(async () => {
      const { folder } = await this.directory(id, false);
      const target = this.target(folder, name);
      const info = await lstat(target).catch(() => undefined);
      if (!info?.isFile() || info.isSymbolicLink())
        throw new AppError(404, 'ATTACHMENT_NOT_FOUND', 'Attachment not found');
      await unlink(target);
    });
  }

  private target(folder: string, name: string): string {
    if (attachmentName(name) !== name)
      throw new AppError(400, 'INVALID_ATTACHMENT_NAME', 'Invalid attachment name');
    return path.join(folder, name);
  }

  private async directory(
    id: string,
    create: boolean,
  ): Promise<{ folder: string; relative: string }> {
    await this.registry.refresh();
    const entry = this.registry.get(id);
    if (!entry) throw new AppError(404, 'DOCUMENT_NOT_FOUND', 'Document not found');
    await resolveExistingDirectory(
      this.root,
      path.posix.dirname(entry.path) === '.' ? '' : path.posix.dirname(entry.path),
    );
    const doc = await lstat(resolveInsideRoot(this.root, entry.path));
    if (!doc.isFile() || doc.isSymbolicLink())
      throw new AppError(400, 'UNSAFE_PATH', 'Unsafe document path');
    const relative = assetsDirFor(entry.path);
    const absolute = resolveInsideRoot(this.root, relative);
    let info = await lstat(absolute).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return undefined;
      throw error;
    });
    if (!info && create) {
      await mkdir(absolute);
      info = await lstat(absolute);
    }
    if (info && (!info.isDirectory() || info.isSymbolicLink()))
      throw new AppError(400, 'UNSAFE_PATH', 'Unsafe attachments directory');
    if (info) await resolveExistingDirectory(this.root, relative);
    return { folder: info ? await realpath(absolute) : absolute, relative };
  }

  private dto(id: string, relative: string, name: string, size: number): AttachmentDto {
    const type = ATTACHMENT_TYPES[path.extname(name).toLowerCase()]!;
    return {
      name,
      size,
      mime: type.mime,
      image: type.image,
      markdownUrl: `${encodePathSegment(path.posix.basename(relative))}/${encodePathSegment(name)}`,
      url: `${API_BASE_PATH}/documents/${encodeURIComponent(id)}/attachments/${encodePathSegment(name)}`,
    };
  }
}
