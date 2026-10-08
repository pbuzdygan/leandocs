import { describe, expect, it, vi } from 'vitest';
import { api } from './client';

function transport() {
  let token = 'a'.repeat(64);
  const calls: {
    url: string;
    headers: Headers;
    method: string;
    body: BodyInit | null | undefined;
  }[] = [];
  const fetchMock = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const path = String(url);
    calls.push({
      url: path,
      headers: new Headers(init?.headers),
      method: init?.method ?? 'GET',
      body: init?.body,
    });
    if (path.endsWith('/auth/session'))
      return Response.json({ authMode: 'none', user: null, csrfToken: token });
    return Response.json({ id: 'a' });
  });
  vi.stubGlobal('fetch', fetchMock);
  return {
    calls,
    fetchMock,
    rotate: () => {
      token = 'b'.repeat(64);
    },
  };
}

describe('CSRF API client', () => {
  it('obtains a fresh token for every JSON/bodyless mutation and sends it only as a header', async () => {
    const { calls, rotate } = transport();
    await api.createDocument({ name: 'Guide' });
    expect(calls.map((call) => call.url)).toEqual(['/api/v1/auth/session', '/api/v1/documents']);
    expect(calls[1]!.headers.get('X-LeanDocs-CSRF')).toBe('a'.repeat(64));
    expect(calls[1]!.body).toBe('{"name":"Guide"}');
    rotate();
    await api.unpin('a');
    expect(calls[3]!.method).toBe('DELETE');
    expect(calls[3]!.headers.get('X-LeanDocs-CSRF')).toBe('b'.repeat(64));
    expect(calls[3]!.body).toBeUndefined();
  });
  it('protects multipart uploads without setting the browser-generated content type', async () => {
    const { calls } = transport();
    await api.uploadAttachment('a', new File(['hello'], 'proof.txt', { type: 'text/plain' }));
    expect(calls[1]!.headers.get('X-LeanDocs-CSRF')).toBe('a'.repeat(64));
    expect(calls[1]!.headers.has('Content-Type')).toBe(false);
    expect(calls[1]!.body).toBeInstanceOf(FormData);
  });
  it('keeps reads token-free and preserves explicit setup/login/logout tokens', async () => {
    const { calls } = transport();
    await api.tree();
    expect(calls).toHaveLength(1);
    expect(calls[0]!.headers.has('X-LeanDocs-CSRF')).toBe(false);
    await api.login({ username: 'admin', password: 'password' }, 'c'.repeat(64));
    await api.logout('d'.repeat(64));
    await api.createAdministrator(
      { username: 'admin', password: 'password', confirmPassword: 'password' },
      'e'.repeat(64),
    );
    expect(calls).toHaveLength(4);
    expect(calls[1]!.headers.get('X-LeanDocs-CSRF')).toBe('c'.repeat(64));
    expect(calls[2]!.headers.get('X-LeanDocs-CSRF')).toBe('d'.repeat(64));
    expect(calls[3]!.headers.get('X-LeanDocs-Setup-Token')).toBe('e'.repeat(64));
  });
  it('does not retry mutations on CSRF rejection or send them if token lookup fails', async () => {
    const { fetchMock } = transport();
    fetchMock.mockResolvedValueOnce(Response.json({ csrfToken: 'a'.repeat(64) }));
    fetchMock.mockResolvedValueOnce(
      Response.json({ error: { code: 'INVALID_CSRF_TOKEN', message: 'Reload' } }, { status: 403 }),
    );
    await expect(api.pin('a')).rejects.toMatchObject({
      status: 403,
      code: 'INVALID_CSRF_TOKEN',
      message: 'Reload',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    fetchMock.mockRejectedValueOnce(new TypeError('offline'));
    await expect(api.pin('a')).rejects.toMatchObject({
      status: 0,
      code: 'NETWORK_ERROR',
      message: 'The server cannot be reached. Check your connection.',
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe('MFA client authentication failures', () => {
  it.each(['INVALID_MFA_CODE', 'INVALID_CREDENTIALS', 'MFA_ENROLLMENT_EXPIRED', 'UNAUTHORIZED'])(
    'only clears the session for UNAUTHORIZED, not %s',
    async (code) => {
      const listener = vi.fn();
      window.addEventListener('leandocs:unauthorized', listener);
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL) =>
          String(input).endsWith('/auth/session')
            ? Response.json({
                authMode: 'local',
                user: { username: 'owner' },
                csrfToken: 'a'.repeat(64),
              })
            : Response.json({ error: { code, message: 'Check credentials' } }, { status: 401 }),
        ),
      );
      try {
        await expect(api.disableMfa('current passphrase', 'bad')).rejects.toMatchObject({
          status: 401,
          code,
          message: 'Check credentials',
        });
        expect(listener).toHaveBeenCalledTimes(code === 'UNAUTHORIZED' ? 1 : 0);
      } finally {
        window.removeEventListener('leandocs:unauthorized', listener);
      }
    },
  );
});
