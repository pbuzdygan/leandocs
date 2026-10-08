import type {
  CreateDocumentRequest,
  DocumentDto,
  MoveDocumentRequest,
  RenameDocumentRequest,
  RecentDocumentsResponse,
  RestoreResponse,
  TrashItem,
  TreeResponse,
  TagsResponse,
  UpdateDocumentRequest,
  UpdatePropertiesRequest,
} from '@leandocs/shared';
import type { FastifyPluginAsync } from 'fastify';
import type { DocumentRegistry } from '../documents/registry.js';
import type { DocumentService } from '../documents/service.js';
import type { ContentSync } from '../watcher/content-sync.js';

export interface DocumentRoutesOptions {
  registry: DocumentRegistry;
  sync: ContentSync;
  service: DocumentService;
}

const idParams = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'string', minLength: 1, maxLength: 128 } },
} as const;

const nameSchema = { type: 'string', minLength: 1, maxLength: 255 } as const;
const pathSchema = { type: 'string', maxLength: 4096 } as const;

export const documentRoutes: FastifyPluginAsync<DocumentRoutesOptions> = async (app, options) => {
  const { registry, sync, service } = options;

  app.get('/tree', async (): Promise<TreeResponse> => {
    // Healthy watchers maintain the index; otherwise reconcile and report external edits here.
    await sync.ensureFresh();
    return { root: registry.tree() };
  });

  app.get<{ Querystring: { limit?: number } }>(
    '/documents/recent',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: { limit: { type: 'integer', minimum: 1, maximum: 100 } },
        },
      },
    },
    async (request): Promise<RecentDocumentsResponse> => {
      await sync.ensureFresh();
      const items = [...registry.list()]
        .sort((a, b) => b.mtimeMs - a.mtimeMs)
        .slice(0, request.query.limit ?? 10)
        .map((entry) => ({
          id: entry.id,
          title: entry.title,
          path: entry.path,
          modified: new Date(entry.mtimeMs).toISOString(),
        }));
      return { items };
    },
  );

  app.get<{ Params: { id: string } }>(
    '/documents/:id',
    { schema: { params: idParams } },
    async (request): Promise<DocumentDto> => service.getDocument(request.params.id),
  );

  app.get<{ Params: { id: string } }>(
    '/documents/:id/raw',
    { schema: { params: idParams } },
    async (request, reply) => {
      const { fileName, bytes } = await service.getRawFile(request.params.id);
      const ascii = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
      return reply
        .header('Content-Type', 'text/markdown; charset=utf-8')
        .header(
          'Content-Disposition',
          `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        )
        .header('X-Content-Type-Options', 'nosniff')
        .send(bytes);
    },
  );

  app.post<{ Body: CreateDocumentRequest }>(
    '/documents',
    {
      schema: {
        body: {
          type: 'object',
          required: ['name'],
          additionalProperties: false,
          properties: {
            name: nameSchema,
            folder: pathSchema,
            title: { type: 'string', maxLength: 500 },
            content: { type: 'string' },
            template: { type: 'string', minLength: 1, maxLength: 255 },
          },
        },
      },
    },
    async (request, reply): Promise<DocumentDto> => {
      const document = await service.createDocument(request.body);
      reply.status(201);
      return document;
    },
  );

  app.put<{ Params: { id: string }; Body: UpdateDocumentRequest }>(
    '/documents/:id',
    {
      schema: {
        params: idParams,
        body: {
          type: 'object',
          required: ['content', 'expectedRevision'],
          additionalProperties: false,
          properties: {
            content: { type: 'string' },
            expectedRevision: { type: 'string', minLength: 1, maxLength: 200 },
          },
        },
      },
    },
    async (request): Promise<DocumentDto> =>
      service.updateDocument(request.params.id, request.body),
  );

  const listSchema = {
    type: 'array',
    maxItems: 100,
    items: { type: 'string', minLength: 1, maxLength: 200, pattern: '^[^\\r\\n]*$' },
  } as const;

  app.post<{ Params: { id: string }; Body: UpdatePropertiesRequest }>(
    '/documents/:id/properties',
    {
      schema: {
        params: idParams,
        body: {
          type: 'object',
          required: ['expectedRevision'],
          additionalProperties: false,
          properties: {
            expectedRevision: { type: 'string', minLength: 1, maxLength: 200 },
            title: { type: 'string', maxLength: 500 },
            description: { type: 'string', maxLength: 2000 },
            tags: listSchema,
            aliases: listSchema,
          },
        },
      },
    },
    async (request): Promise<DocumentDto> =>
      service.updateProperties(request.params.id, request.body),
  );

  app.get('/tags', async (): Promise<TagsResponse> => {
    await sync.ensureFresh();
    return { items: registry.store.tags() };
  });

  app.post<{ Params: { id: string }; Body: RenameDocumentRequest }>(
    '/documents/:id/rename',
    {
      schema: {
        params: idParams,
        body: {
          type: 'object',
          required: ['name'],
          additionalProperties: false,
          properties: { name: nameSchema, title: { type: 'string', maxLength: 500 } },
        },
      },
    },
    async (request): Promise<DocumentDto> =>
      service.renameDocument(request.params.id, request.body),
  );

  app.post<{ Params: { id: string }; Body: MoveDocumentRequest }>(
    '/documents/:id/move',
    {
      schema: {
        params: idParams,
        body: {
          type: 'object',
          required: ['folder'],
          additionalProperties: false,
          properties: { folder: pathSchema, createFolders: { type: 'boolean' } },
        },
      },
    },
    async (request): Promise<DocumentDto> => service.moveDocument(request.params.id, request.body),
  );

  app.delete<{ Params: { id: string } }>(
    '/documents/:id',
    { schema: { params: idParams } },
    async (request): Promise<TrashItem> => service.trashDocument(request.params.id),
  );

  app.post<{ Params: { id: string } }>(
    '/documents/:id/restore',
    { schema: { params: idParams } },
    async (request): Promise<RestoreResponse> => service.restoreDocument(request.params.id),
  );
};
