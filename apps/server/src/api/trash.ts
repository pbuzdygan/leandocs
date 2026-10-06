import type { RestoreResponse, TrashResponse } from '@leandocs/shared';
import type { FastifyPluginAsync } from 'fastify';
import type { DocumentService } from '../documents/service.js';
import type { TrashService } from '../trash/trash.js';

export interface TrashRoutesOptions {
  trash: TrashService;
  service: DocumentService;
}

const trashParams = {
  type: 'object',
  required: ['trashId'],
  properties: { trashId: { type: 'string', minLength: 1, maxLength: 64 } },
} as const;

export const trashRoutes: FastifyPluginAsync<TrashRoutesOptions> = async (app, options) => {
  const { trash, service } = options;

  app.get('/trash', async (): Promise<TrashResponse> => ({ items: await trash.list() }));

  app.post<{ Params: { trashId: string } }>(
    '/trash/:trashId/restore',
    { schema: { params: trashParams } },
    async (request): Promise<RestoreResponse> => service.restoreTrashItem(request.params.trashId),
  );

  // Permanent delete: the only destructive operations, and only for items already in the trash.
  app.delete<{ Params: { trashId: string } }>(
    '/trash/:trashId',
    { schema: { params: trashParams } },
    async (request, reply) => {
      await service.deleteTrashItem(request.params.trashId);
      return reply.status(204).send();
    },
  );

  app.delete('/trash', async () => ({ deleted: await service.emptyTrash() }));
};
