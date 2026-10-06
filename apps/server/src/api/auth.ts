import { LoginRateLimitError } from '../auth/rate-limit.js';
import type { LoginRequest, SessionResponse } from '@leandocs/shared';
import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { type AuthService, sessionCookie } from '../auth/session.js';
import { AppError } from '../errors.js';
import type { ProxyAuthService } from '../auth/proxy.js';

export const authRoutes: FastifyPluginAsync<{
  auth: AuthService;
  secureCookie: boolean;
  proxyAuth?: ProxyAuthService;
  noneSession?: SessionResponse;
}> = async (app, { auth, secureCookie, proxyAuth, noneSession }) => {
  app.addHook('onRequest', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
  });
  app.get(
    '/auth/session',
    async (request) =>
      noneSession ??
      (proxyAuth ? proxyAuth.session(request) : auth.session(request.headers.cookie)),
  );
  app.post<{ Body: LoginRequest }>(
    '/auth/login',
    {
      bodyLimit: 8 * 1024,
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['username', 'password'],
          properties: {
            username: { type: 'string', minLength: 1, maxLength: 128 },
            password: { type: 'string', minLength: 1, maxLength: 1024 },
          },
        },
      },
    },
    async (request, reply) => {
      if (!request.headers['content-type']?.startsWith('application/json'))
        throw new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Send sign-in details as JSON.');
      const result = await auth
        .login(request.body, request.raw.socket.remoteAddress ?? '', request.headers.cookie)
        .catch((error: unknown) => {
          if (error instanceof LoginRateLimitError)
            reply.header('Retry-After', String(error.retryAfterSeconds));
          throw error;
        });
      if ('challenge' in result) return result.challenge;
      reply.header(
        'Set-Cookie',
        sessionCookie(result.token, secureCookie || request.protocol === 'https'),
      );
      return result.session;
    },
  );

  app.addHook('onError', async (_request, reply, error) => {
    if (error instanceof LoginRateLimitError)
      reply.header('Retry-After', String(error.retryAfterSeconds));
  });
  app.get('/auth/mfa/status', async () => auth.mfaStatus());
  const code = { type: 'string', minLength: 1, maxLength: 64 };
  const password = { type: 'string', minLength: 1, maxLength: 1024 };
  const schema = (properties: Record<string, unknown>) => ({
    body: {
      type: 'object',
      additionalProperties: false,
      required: Object.keys(properties),
      properties,
    },
  });
  const setSession = (reply: FastifyReply, token: string, secure: boolean) =>
    reply.header('Set-Cookie', sessionCookie(token, secure));
  app.post<{ Body: { challenge: string; code: string } }>(
    '/auth/mfa/verify',
    {
      bodyLimit: 2048,
      schema: schema({ challenge: { type: 'string', pattern: '^[0-9a-f]{64}$' }, code }),
    },
    async (request, reply) => {
      const result = auth.verifyMfa(
        request.body.challenge,
        request.body.code,
        request.raw.socket.remoteAddress ?? '',
        request.headers.cookie,
      );
      setSession(reply, result.token, secureCookie || request.protocol === 'https');
      return result.session;
    },
  );
  app.post<{ Body: { password: string } }>(
    '/auth/mfa/enroll',
    { bodyLimit: 8192, schema: schema({ password }) },
    async (request) =>
      auth.enrollMfa(
        request.headers.cookie,
        request.body.password,
        request.raw.socket.remoteAddress ?? '',
      ),
  );
  app.delete('/auth/mfa/enroll', async (request, reply) => {
    auth.cancelEnrollment(request.headers.cookie);
    return reply.status(204).send();
  });
  app.post<{ Body: { code: string } }>(
    '/auth/mfa/confirm',
    { bodyLimit: 2048, schema: schema({ code }) },
    async (request, reply) => {
      const result = auth.confirmMfa(
        request.headers.cookie,
        request.body.code,
        request.raw.socket.remoteAddress ?? '',
      );
      setSession(reply, result.token, secureCookie || request.protocol === 'https');
      return { session: result.session, recoveryCodes: result.recoveryCodes };
    },
  );
  app.post<{ Body: { password: string; code: string } }>(
    '/auth/mfa/disable',
    { bodyLimit: 8192, schema: schema({ password, code }) },
    async (request, reply) => {
      const result = await auth.disableMfa(
        request.headers.cookie,
        request.body.password,
        request.body.code,
        request.raw.socket.remoteAddress ?? '',
      );
      setSession(reply, result.token, secureCookie || request.protocol === 'https');
      return result.session;
    },
  );

  app.post('/auth/logout', async (request, reply) => {
    auth.logout(request.headers.cookie);
    reply.header(
      'Set-Cookie',
      sessionCookie('', secureCookie || request.protocol === 'https', true),
    );
    return reply.status(204).send();
  });
};
