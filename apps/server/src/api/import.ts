import multipart from '@fastify/multipart';
import {
  IMPORTERS,
  MAX_IMPORT_DOCUMENT_BYTES,
  MAX_IMPORT_FILES,
  IMPORT_NAME_ONLY_TYPE,
  type ImportReport,
  type ImporterKind,
} from '@leandocs/shared';
import type { FastifyPluginAsync } from 'fastify';
import { isAttachmentFileName } from '../attachments/validation.js';
import { AppError } from '../errors.js';
import { normalizeRelativePath } from '../filesystem/safe-path.js';
import type { ImportEntry } from '../import/importer.js';
import type { ImportService } from '../import/service.js';

/** Documents and attachments kept in memory for one request; other uploads are only counted. */
const MAX_IMPORT_READ_BYTES = 256 * 1024 * 1024;

interface ImportQuery {
  importer: ImporterKind;
  destination: string;
  dryRun: boolean;
}

/**
 * `POST /import` (ADR-0022): a multipart upload of the selected files, each part named `files`
 * with its path inside the selection as the file name. `dryRun=true` returns the preview without
 * writing; the same request without it imports.
 */
export const importRoutes: FastifyPluginAsync<{
  imports: ImportService;
  maxFileSize: number;
}> = async (app, { imports, maxFileSize }) => {
  await app.register(multipart, {
    // Larger files are truncated and reported as too large, never stored.
    limits: { fileSize: maxFileSize, files: MAX_IMPORT_FILES, fields: 0 },
    throwFileSizeLimit: false,
    preservePath: true,
  });
  app.post<{ Querystring: ImportQuery }>(
    '/import',
    {
      schema: {
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            importer: { type: 'string', enum: [...IMPORTERS], default: 'markdown-directory' },
            destination: { type: 'string', maxLength: 4096, default: '' },
            dryRun: { type: 'boolean', default: false },
          },
        },
      },
    },
    async (request): Promise<ImportReport> => {
      const { importer: kind, destination, dryRun } = request.query;
      const importer = imports.importer(kind);
      const entries: ImportEntry[] = [];
      const seen = new Set<string>();
      let readBytes = 0;
      try {
        for await (const part of request.parts()) {
          if (part.type !== 'file' || part.fieldname !== 'files')
            throw new AppError(400, 'INVALID_UPLOAD', 'Upload the selected files as "files"');
          const source = sourcePath(part.filename);
          const nameOnly = part.mimetype === IMPORT_NAME_ONLY_TYPE;
          // Documents and possible attachments are kept in memory; everything else is counted.
          const limit =
            source === undefined || nameOnly
              ? 0
              : importer.reads(source)
                ? MAX_IMPORT_DOCUMENT_BYTES
                : isAttachmentFileName(source)
                  ? maxFileSize
                  : 0;
          const chunks: Buffer[] = [];
          let size = 0;
          for await (const chunk of part.file as AsyncIterable<Buffer>) {
            size += chunk.length;
            if (size <= limit) chunks.push(chunk);
          }
          if (source === undefined || seen.has(source))
            throw new AppError(
              400,
              'INVALID_UPLOAD',
              `Invalid or repeated file path: "${part.filename}"`,
            );
          seen.add(source);
          const entry: ImportEntry = { path: source, size };
          if (!nameOnly && part.mimetype) entry.mime = part.mimetype;
          if (limit > 0 && (part.file.truncated || size > limit)) entry.tooLarge = true;
          else if (limit > 0) {
            readBytes += size;
            if (readBytes > MAX_IMPORT_READ_BYTES)
              throw new AppError(
                413,
                'IMPORT_TOO_LARGE',
                'The selection is too large to import at once; import it in parts',
              );
            entry.bytes = Buffer.concat(chunks);
          }
          entries.push(entry);
        }
      } catch (error) {
        if ((error as { code?: string }).code === 'FST_FILES_LIMIT')
          throw new AppError(
            413,
            'IMPORT_TOO_MANY_FILES',
            `Import at most ${MAX_IMPORT_FILES} files at once`,
          );
        throw error;
      }
      if (entries.length === 0) throw new AppError(400, 'IMPORT_EMPTY', 'Choose files to import');
      return dryRun
        ? imports.preview(kind, destination, entries)
        : imports.import(kind, destination, entries);
    },
  );
};

/** The browser's relative path (`Notes/Network/Router.md`); `undefined` when unsafe. */
function sourcePath(name: string): string | undefined {
  try {
    const normalized = normalizeRelativePath(name.normalize('NFC'));
    return normalized === '' ? undefined : normalized;
  } catch {
    return undefined;
  }
}
