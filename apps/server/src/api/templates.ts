import type { TemplatesResponse } from '@leandocs/shared';
import type { FastifyPluginAsync } from 'fastify';
import type { TemplateService } from '../templates/service.js';

/** PROJECT_SPEC §60: `GET /templates`. */
export const templateRoutes: FastifyPluginAsync<{ templates: TemplateService }> = async (
  app,
  { templates },
) => {
  app.get('/templates', async (): Promise<TemplatesResponse> => ({
    items: await templates.list(),
  }));
};
