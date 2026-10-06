import type {
  CreateFolderRequest,
  DeleteFolderResponse,
  FolderDto,
  MoveFolderRequest,
  RenameFolderRequest,
} from '@leandocs/shared';
import type { FastifyPluginAsync } from 'fastify';
import type { FolderService } from '../folders/service.js';

export interface FolderRoutesOptions {
  folders: FolderService;
}

const nameSchema = { type: 'string', minLength: 1, maxLength: 255 } as const;
const pathSchema = { type: 'string', maxLength: 4096 } as const;

/** Folder paths contain `/`, so they travel in the body or query string, not in the URL path. */
export const folderRoutes: FastifyPluginAsync<FolderRoutesOptions> = async (app, { folders }) => {
  app.post<{ Body: CreateFolderRequest }>(
    '/folders',
    {
      schema: {
        body: {
          type: 'object',
          required: ['name'],
          additionalProperties: false,
          properties: { parent: pathSchema, name: nameSchema },
        },
      },
    },
    async (request, reply): Promise<FolderDto> => {
      const folder = await folders.createFolder(request.body);
      reply.status(201);
      return folder;
    },
  );

  app.post<{ Body: RenameFolderRequest }>(
    '/folders/rename',
    {
      schema: {
        body: {
          type: 'object',
          required: ['path', 'name'],
          additionalProperties: false,
          properties: { path: pathSchema, name: nameSchema },
        },
      },
    },
    async (request): Promise<FolderDto> => folders.renameFolder(request.body),
  );

  app.post<{ Body: MoveFolderRequest }>(
    '/folders/move',
    {
      schema: {
        body: {
          type: 'object',
          required: ['path', 'targetFolder'],
          additionalProperties: false,
          properties: { path: pathSchema, targetFolder: pathSchema },
        },
      },
    },
    async (request): Promise<FolderDto> => folders.moveFolder(request.body),
  );

  app.delete<{ Querystring: { path: string } }>(
    '/folders',
    {
      schema: {
        querystring: {
          type: 'object',
          required: ['path'],
          properties: { path: { type: 'string', minLength: 1, maxLength: 4096 } },
        },
      },
    },
    async (request): Promise<DeleteFolderResponse> => folders.deleteFolder(request.query.path),
  );
};
