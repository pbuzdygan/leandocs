import { encodePathSegment } from '@leandocs/shared';
import multipart from '@fastify/multipart';
import type { FastifyPluginAsync } from 'fastify';
import type { AttachmentService } from '../attachments/service.js';
import { AppError } from '../errors.js';

export const attachmentRoutes: FastifyPluginAsync<{
  attachments: AttachmentService;
  limit: number;
}> = async (app, { attachments, limit }) => {
  await app.register(multipart, {
    limits: { fileSize: limit, files: 1, fields: 0, parts: 1 },
    throwFileSizeLimit: true,
    preservePath: true,
  });
  app.get<{ Params: { id: string } }>('/documents/:id/attachments', async (request) => ({
    items: await attachments.list(request.params.id),
  }));
  app.post<{ Params: { id: string } }>(
    '/documents/:id/attachments',
    { bodyLimit: limit + 64 * 1024 },
    async (request, reply) => {
      let upload: { name: string; mime: string; bytes: Buffer } | undefined;
      // Consume the full multipart message before publishing a file: extra parts must fail too.
      for await (const part of request.parts()) {
        if (part.type !== 'file' || part.fieldname !== 'file' || upload)
          throw new AppError(400, 'INVALID_UPLOAD', 'Upload exactly one file');
        upload = { name: part.filename, mime: part.mimetype, bytes: await part.toBuffer() };
      }
      if (!upload) throw new AppError(400, 'INVALID_UPLOAD', 'Choose a file to upload');
      return reply
        .status(201)
        .send(await attachments.upload(request.params.id, upload.name, upload.mime, upload.bytes));
    },
  );
  app.get<{ Params: { id: string; filename: string }; Querystring: { download?: string } }>(
    '/documents/:id/attachments/:filename',
    async (request, reply) => {
      const { item, bytes } = await attachments.get(request.params.id, request.params.filename);
      const ascii = item.name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
      const disposition = item.image && request.query.download !== '1' ? 'inline' : 'attachment';
      return reply
        .header('Content-Type', item.mime)
        .header('X-Content-Type-Options', 'nosniff')
        .header(
          'Content-Security-Policy',
          "sandbox; default-src 'none'; script-src 'none'; style-src 'unsafe-inline'",
        )
        .header('Cache-Control', 'no-store')
        .header(
          'Content-Disposition',
          `${disposition}; filename="${ascii}"; filename*=UTF-8''${encodePathSegment(item.name)}`,
        )
        .send(bytes);
    },
  );
  app.delete<{ Params: { id: string; filename: string } }>(
    '/documents/:id/attachments/:filename',
    async (request, reply) => {
      await attachments.delete(request.params.id, request.params.filename);
      return reply.status(204).send();
    },
  );
};
