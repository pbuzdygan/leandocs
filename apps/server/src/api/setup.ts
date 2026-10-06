import type { SetupRequest, SetupStatus } from '@leandocs/shared';
import type { FastifyPluginAsync } from 'fastify';
import type { SetupService } from '../auth/setup.js';
import { AppError } from '../errors.js';

export const setupRoutes: FastifyPluginAsync<{
  setup: SetupService;
  bypassSetup?: SetupStatus;
}> = async (app, { setup, bypassSetup }) => {
  app.addHook('onRequest', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
    reply.header('X-Content-Type-Options', 'nosniff');
  });
  app.get('/auth/setup', async () => bypassSetup ?? setup.status());
  app.post<{ Body: SetupRequest }>(
    '/auth/setup',
    {
      bodyLimit: 16 * 1024,
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['username', 'password', 'confirmPassword'],
          properties: {
            username: { type: 'string', minLength: 1, maxLength: 128 },
            password: { type: 'string', minLength: 1, maxLength: 1024 },
            confirmPassword: { type: 'string', minLength: 1, maxLength: 1024 },
          },
        },
      },
      preValidation: async (request) => {
        if (!request.headers['content-type']?.startsWith('application/json'))
          throw new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Send setup as JSON.');
        if (request.headers['sec-fetch-site'] === 'cross-site')
          throw new AppError(
            403,
            'CROSS_SITE_REQUEST',
            'Setup must be submitted from this application.',
          );
      },
    },
    async (request, reply) => {
      const token = request.headers['x-leandocs-setup-token'];
      const status = await setup.create(
        request.body,
        typeof token === 'string' ? token : undefined,
      );
      return reply.status(201).send(status);
    },
  );
};
