import { APP_NAME, type HealthResponse } from '@leandocs/shared';
import type { FastifyPluginAsync } from 'fastify';
import { SERVER_VERSION } from '../version.js';

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get('/health', async (): Promise<HealthResponse> => {
    return { status: 'ok', name: APP_NAME, version: SERVER_VERSION };
  });
};
