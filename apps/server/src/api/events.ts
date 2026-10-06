import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import type { AppConfig } from '../config/config.js';
import { checkCsrfOrigin } from '../auth/csrf.js';
import type { ChangeEvents } from '../watcher/change-events.js';

export const eventRoutes: FastifyPluginAsync<{
  events: ChangeEvents;
  config: AppConfig;
  authorized: (request: FastifyRequest) => boolean;
}> = async (app, { events, config, authorized }) => {
  app.get('/events', { exposeHeadRoute: false }, (request, reply) => {
    // EventSource is a read request, but its long-lived stream must also reject foreign origins.
    checkCsrfOrigin(request, config, true);
    const stream = events.connect(() => authorized(request));
    const disconnect = () => stream.destroy();
    reply.raw.once('close', disconnect);
    stream.once('close', () => reply.raw.removeListener('close', disconnect));
    return reply
      .header('Content-Type', 'text/event-stream; charset=utf-8')
      .header('Cache-Control', 'no-store, no-transform')
      .header('X-Accel-Buffering', 'no')
      .send(stream);
  });
};
