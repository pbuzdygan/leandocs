import type { PinsResponse } from '@leandocs/shared';
import type { FastifyPluginAsync } from 'fastify';
import type { PinService } from '../pins/service.js';
import type { ContentSync } from '../watcher/content-sync.js';

const idParams = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'string', minLength: 1, maxLength: 128 } },
} as const;

/** Pins (PROJECT_SPEC §40): `GET /pins`, `PUT /pins/:id`, `DELETE /pins/:id`. */
export const pinRoutes: FastifyPluginAsync<{
  sync: ContentSync;
  pins: PinService;
}> = async (app, { sync, pins }) => {
  app.get('/pins', async (): Promise<PinsResponse> => {
    await sync.refresh();
    return { items: pins.list() };
  });
  app.put<{ Params: { id: string } }>(
    '/pins/:id',
    { schema: { params: idParams } },
    async (request, reply) => {
      await sync.refresh();
      pins.pin(request.params.id);
      return reply.status(204).send();
    },
  );
  app.delete<{ Params: { id: string } }>(
    '/pins/:id',
    { schema: { params: idParams } },
    async (request, reply) => {
      pins.unpin(request.params.id);
      return reply.status(204).send();
    },
  );
};
