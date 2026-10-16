import { APP_NAME, encodePathSegment } from '@leandocs/shared';
import multipart from '@fastify/multipart';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import type { AttachmentService } from '../attachments/service.js';
import { AppError } from '../errors.js';

/**
 * A browser that opens an attachment link itself (new tab, bookmark, a link from elsewhere) asked
 * for a page, not data: answer a missing file with a short page instead of the JSON error.
 * Fetches from the app (HEAD before opening, `fetch`) keep the JSON body.
 */
function isNavigation(request: FastifyRequest): boolean {
  const mode = request.headers['sec-fetch-mode'];
  if (typeof mode === 'string') return mode === 'navigate';
  return /\btext\/html\b/.test(request.headers.accept ?? '');
}

// Static text only: the document id is the one value used, and only when it is a plain id.
const NOT_FOUND_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

function notFoundPage(documentId: string, documentExists: boolean): string {
  const back =
    documentExists && /^[A-Za-z0-9-]{1,64}$/.test(documentId)
      ? `<a href="/doc/${documentId}">Back to the document</a>`
      : `<a href="/">Open ${APP_NAME}</a>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>File not found · ${APP_NAME}</title>
<style>
:root { color-scheme: light dark; --text: #0f172a; --muted: #475569; --bg: #f8fafc; --accent: #2563eb; }
@media (prefers-color-scheme: dark) { :root { --text: #e2e8f0; --muted: #94a3b8; --bg: #0f172a; --accent: #60a5fa; } }
body { margin: 0; background: var(--bg); color: var(--text); font: 15px/1.6 system-ui, sans-serif; }
main { max-width: 32rem; margin: 18vh auto 0; padding: 0 16px; }
h1 { margin: 0 0 8px; font-size: 24px; }
p { margin: 0 0 16px; color: var(--muted); }
a { color: var(--accent); }
</style>
</head>
<body>
<main>
<h1>File not found</h1>
<p>This attachment is no longer stored with the document. It may have been deleted or renamed. Open the document's attachments to see the files it has now.</p>
<p>${back}</p>
</main>
</body>
</html>
`;
}

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
      let found: Awaited<ReturnType<AttachmentService['get']>>;
      try {
        found = await attachments.get(request.params.id, request.params.filename);
      } catch (error) {
        if (!(error instanceof AppError) || error.statusCode !== 404 || !isNavigation(request))
          throw error;
        return reply
          .status(404)
          .header('Content-Type', 'text/html; charset=utf-8')
          .header('Content-Security-Policy', NOT_FOUND_CSP)
          .header('Cache-Control', 'no-store')
          .send(notFoundPage(request.params.id, error.code === 'ATTACHMENT_NOT_FOUND'));
      }
      const { item, bytes } = found;
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
