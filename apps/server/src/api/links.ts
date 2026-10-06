import type {
  BacklinksResponse,
  BrokenLinksResponse,
  OutgoingLinksResponse,
} from '@leandocs/shared';
import type { FastifyPluginAsync } from 'fastify';
import type { LinkService } from '../links/service.js';
import type { ContentSync } from '../watcher/content-sync.js';

const idParams = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'string', minLength: 1, maxLength: 128 } },
} as const;

/** PROJECT_SPEC §60 links API plus the broken-links overview (§25). */
export const linkRoutes: FastifyPluginAsync<{
  sync: ContentSync;
  links: LinkService;
}> = async (app, { sync, links }) => {
  app.get<{ Params: { id: string } }>(
    '/documents/:id/links',
    { schema: { params: idParams } },
    async (request): Promise<OutgoingLinksResponse> => {
      await sync.ensureFresh();
      return { items: links.outgoing(request.params.id) };
    },
  );

  app.get<{ Params: { id: string } }>(
    '/documents/:id/backlinks',
    { schema: { params: idParams } },
    async (request): Promise<BacklinksResponse> => {
      await sync.ensureFresh();
      return { items: links.backlinks(request.params.id) };
    },
  );

  app.get('/links/broken', async (): Promise<BrokenLinksResponse> => {
    await sync.ensureFresh();
    return { items: links.broken() };
  });
};
