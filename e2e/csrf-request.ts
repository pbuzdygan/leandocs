import type { APIRequestContext } from '@playwright/test';

/** API fixtures obey the same token protocol as the browser client. */
export function csrfRequest(request: APIRequestContext): APIRequestContext {
  return new Proxy(request, {
    get(target, property) {
      if (['post', 'put', 'patch', 'delete'].includes(String(property)))
        return async (url: string, options: Parameters<APIRequestContext['post']>[1] = {}) => {
          const status = await target.get('/api/v1/auth/session');
          const { csrfToken } = (await status.json()) as { csrfToken: string };
          const method = target[property as 'post' | 'put' | 'patch' | 'delete'];
          return method.call(target, url, {
            ...options,
            headers: { 'X-LeanDocs-CSRF': csrfToken, ...options.headers },
          });
        };
      const value: unknown = Reflect.get(target, property);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}
