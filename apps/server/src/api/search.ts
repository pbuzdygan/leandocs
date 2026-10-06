import { SEARCH_MAX_LIMIT, type SearchResponse } from '@leandocs/shared';
import type { FastifyPluginAsync } from 'fastify';
import type { SearchService } from '../search/service.js';
import type { ContentSync } from '../watcher/content-sync.js';

export interface SearchRoutesOptions {
  sync: ContentSync;
  search: SearchService;
}

export const searchRoutes: FastifyPluginAsync<SearchRoutesOptions> = async (app, options) => {
  const { sync, search } = options;

  app.get<{ Querystring: { q: string; limit?: number } }>(
    '/search',
    {
      schema: {
        querystring: {
          type: 'object',
          required: ['q'],
          properties: {
            q: { type: 'string', maxLength: 500 },
            limit: { type: 'integer', minimum: 1, maximum: SEARCH_MAX_LIMIT },
          },
        },
      },
    },
    async (request): Promise<SearchResponse> => {
      // Like the tree, use watcher updates or scan on demand when watching is unavailable.
      await sync.ensureFresh();
      return {
        query: request.query.q,
        results: search.search(request.query.q, request.query.limit),
      };
    },
  );
};
