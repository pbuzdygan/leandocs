import { useEffect } from 'react';
import { render } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import userEvent from '@testing-library/user-event';
import type { TreeFolderNode, TreeNode, UpdateSettingsRequest } from '@leandocs/shared';
import { MemoryRouter, useLocation } from 'react-router';
import { vi } from 'vitest';
import { AppRoutes } from '../app/App';
import { Providers } from '../app/Providers';
import { getTestSettings, setTestSettings } from './settings';

export { setTestSettings };

export interface MockRequest {
  method: string;
  path: string;
  body: unknown;
}

type Handler = (request: MockRequest) => { status?: number; body?: unknown } | undefined;

/**
 * Stubs fetch for /api/v1. `routes` maps "METHOD /path" (query string included, exact match)
 * or a handler function. Unmatched requests return 404. Returns the list of requests made.
 */
export function mockApi(routes: Record<string, unknown> | Handler) {
  const requests: MockRequest[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const path = url.replace(/^\/api\/v1/, '');
    const method = init?.method ?? 'GET';
    const body =
      typeof init?.body === 'string'
        ? JSON.parse(init.body)
        : init?.body instanceof FormData
          ? init.body
          : undefined;
    const request = { method, path, body };
    requests.push(request);
    const configured =
      typeof routes === 'function'
        ? routes(request)
        : `${method} ${path}` in routes
          ? { body: routes[`${method} ${path}`] }
          : undefined;
    // Existing content tests represent an already configured installation.
    const result =
      configured ??
      (method === 'GET' && path === '/auth/session'
        ? {
            body: {
              authMode: 'local',
              user: { username: 'test-admin' },
              csrfToken: 'a'.repeat(64),
            },
          }
        : undefined) ??
      (method === 'GET' && path === '/auth/setup'
        ? { body: { required: false, contentDir: '/data/content' } }
        : undefined) ??
      (path === '/settings' && method === 'GET' ? { body: getTestSettings() } : undefined) ??
      (path === '/settings' && method === 'PATCH'
        ? (setTestSettings(body as UpdateSettingsRequest), { body: getTestSettings() })
        : undefined);
    if (!result) {
      return Response.json({ error: { code: 'NOT_FOUND', message: 'Not found' } }, { status: 404 });
    }
    if (result.status === 204) return new Response(null, { status: 204 });
    return Response.json(result.body ?? {}, { status: result.status ?? 200 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return requests;
}

function LocationProbe({ onChange }: { onChange: (path: string) => void }) {
  const { pathname } = useLocation();
  useEffect(() => onChange(pathname), [pathname, onChange]);
  return null;
}

/** Renders the whole app at `route` with a fresh query client. */
export function renderApp(route = '/') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const user = userEvent.setup();
  let currentPath = route;
  const track = (path: string) => {
    currentPath = path;
  };
  const utils = render(
    <MemoryRouter initialEntries={[route]}>
      <Providers client={client}>
        <AppRoutes />
        <LocationProbe onChange={track} />
      </Providers>
    </MemoryRouter>,
  );
  return { ...utils, user, client, location: () => currentPath };
}

export function folder(path: string, children: TreeNode[] = []): TreeFolderNode {
  return { type: 'folder', name: path.split('/').pop() ?? '', path, children };
}

export function doc(path: string, id: string, title?: string): TreeNode {
  const name = path.split('/').pop() ?? path;
  return { type: 'document', id, title: title ?? name.replace(/\.md$/, ''), name, path };
}

/** A small BUZLAB-like tree used by most tests. */
export function sampleTree(): TreeFolderNode {
  return folder('', [
    folder('Infrastructure', [
      folder('Infrastructure/Servers', [
        doc('Infrastructure/Servers/BUZHULK.md', 'id-buzhulk'),
        doc('Infrastructure/Servers/BUZPI00.md', 'id-buzpi00'),
      ]),
    ]),
    folder('Network', [doc('Network/VLAN.md', 'id-vlan')]),
    doc('README.md', 'id-readme', 'Read me'),
  ]);
}

export function documentDto(id: string, path: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    title: path.split('/').pop()?.replace(/\.md$/, ''),
    path,
    content: 'Hello world\n',
    frontmatter: {},
    revision: 'sha256:abc',
    created: '2026-10-01T00:00:00Z',
    updated: '2026-10-02T00:00:00Z',
    ...overrides,
  };
}
