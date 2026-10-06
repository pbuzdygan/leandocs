import { buildApp as originalBuildApp } from '../app.js';
import type { AppConfig } from '../config/config.js';
import type { SetupStatus, SessionResponse } from '@leandocs/shared';

/** Content API tests use real setup/login/session cookies, without weakening production auth. */
export async function buildApp(config: AppConfig, watchContent = false) {
  // Legacy content tests write files and immediately read; explicitly test the off-mode fallback.
  // Watcher integration tests opt in and wait for eventual index updates, as production clients do.
  const app = await originalBuildApp({
    ...config,
    watchMode: watchContent ? config.watchMode : 'off',
  });
  try {
    const status = (await app.inject('/api/v1/auth/setup')).json<SetupStatus>();
    if (status.required)
      await app.inject({
        method: 'POST',
        url: '/api/v1/auth/setup',
        headers: { 'x-leandocs-setup-token': status.setupToken },
        payload: {
          username: 'test-admin',
          password: 'test administrator passphrase',
          confirmPassword: 'test administrator passphrase',
        },
      });
    const session = (await app.inject('/api/v1/auth/session')).json<SessionResponse>();
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { 'x-leandocs-csrf': session.csrfToken },
      payload: { username: 'test-admin', password: 'test administrator passphrase' },
    });
    if (login.statusCode !== 200) throw new Error(`Test login failed: ${login.statusCode}`);
    const csrf = login.json<SessionResponse>().csrfToken;
    const cookie = String(login.headers['set-cookie']).split(';')[0]!;
    const inject = app.inject;
    // Preserve Fastify's chain/callback overloads; only add a default cookie to request options.
    app.inject = new Proxy(inject, {
      apply(target, thisArg, args: unknown[]) {
        const options = args[0];
        if (typeof options === 'string') args[0] = { url: options, headers: { cookie } };
        else if (typeof options === 'object' && options !== null) {
          const opts = options as { headers?: Record<string, unknown> };
          args[0] = { ...opts, headers: { cookie, 'x-leandocs-csrf': csrf, ...opts.headers } };
        }
        return Reflect.apply(target, thisArg, args);
      },
    });
    return app;
  } catch (error) {
    await app.close();
    throw error;
  }
}
