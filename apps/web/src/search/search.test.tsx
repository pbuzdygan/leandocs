import type { IndexStatusResponse, SearchResponse } from '@leandocs/shared';
import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockApi, renderApp, sampleTree, type MockRequest } from '../test/render';
import { formatBytes } from '../utils/format';
import { allDocuments, quickOpen } from './quick-open';

afterEach(() => {
  vi.unstubAllGlobals();
});

const recent = {
  items: [
    {
      id: 'id-vlan',
      title: 'VLAN',
      path: 'Network/VLAN.md',
      modified: '2026-10-02T00:00:00Z',
    },
  ],
};

function searchResponse(q: string): SearchResponse {
  if (q.includes('nothing')) return { query: q, results: [] };
  return {
    query: q,
    results: [
      {
        id: 'id-buzhulk',
        title: 'BUZHULK',
        path: 'Infrastructure/Servers/BUZHULK.md',
        match: 'content',
        tags: [],
        snippet: [
          { text: 'The Incus VM uses ', match: false },
          { text: 'macvlan', match: true },
          { text: ' for <host> traffic', match: false },
        ],
      },
      {
        id: 'id-vlan',
        title: 'VLAN',
        path: 'Network/VLAN.md',
        match: 'content',
        tags: [],
        snippet: [{ text: 'macvlan', match: true }],
      },
    ],
  };
}

function api(
  extra: (request: MockRequest) => { status?: number; body?: unknown } | undefined = () =>
    undefined,
) {
  return mockApi((request) => {
    const custom = extra(request);
    if (custom) return custom;
    if (request.path === '/tree') return { body: { root: sampleTree() } };
    if (request.path.startsWith('/documents/recent')) return { body: recent };
    if (request.path.startsWith('/search?')) {
      const q = new URLSearchParams(request.path.split('?')[1]).get('q') ?? '';
      return { body: searchResponse(q) };
    }
    return undefined;
  });
}

describe('command palette', () => {
  it('opens with Ctrl+K, shows snippets as text and opens the chosen result', async () => {
    const requests = api();
    const { user, location } = renderApp('/');
    await screen.findByText('Recently updated');

    await user.keyboard('{Control>}k{/Control}');
    const input = await screen.findByRole('combobox', { name: 'Search documentation' });
    expect(input).toHaveFocus();
    // Empty query: recent documents.
    expect(await screen.findByRole('option', { name: /VLAN/ })).toBeInTheDocument();

    await user.type(input, 'macvlan');
    const option = await screen.findByRole('option', { name: /BUZHULK/ });
    expect(within(option).getByText('Infrastructure / Servers')).toBeInTheDocument();
    const mark = option.querySelector('mark');
    expect(mark?.textContent).toBe('macvlan');
    // Snippet text is rendered as text, never as HTML.
    expect(option.textContent).toContain('for <host> traffic');
    expect(requests.some((r) => r.path === '/search?q=macvlan&limit=20')).toBe(true);

    expect(option).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('option', { name: /^VLAN/ })).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{ArrowDown}{Enter}');
    await waitFor(() => expect(location()).toBe('/doc/id-buzhulk'));
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('opens from the topbar search field and shows recognised filters and empty results', async () => {
    api();
    const { user } = renderApp('/');
    await user.click(await screen.findByRole('button', { name: /Search documentation/ }));
    const input = await screen.findByRole('combobox', { name: 'Search documentation' });
    await user.type(input, 'nothing tag:docker');
    expect(screen.getByLabelText('Filters')).toHaveTextContent('tag: docker');
    expect(await screen.findByText('No results for “nothing tag:docker”')).toBeInTheDocument();
    expect(screen.getByText('Try another phrase or check your filters.')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('combobox')).not.toBeInTheDocument());
  });

  it('quick open (Ctrl+P) matches titles and paths locally without full-text search', async () => {
    const requests = api();
    const { user, location } = renderApp('/');
    await screen.findByText('Recently updated');
    await user.keyboard('{Control>}p{/Control}');
    const input = await screen.findByRole('combobox', { name: 'Open document' });
    await user.type(input, 'bzpi');
    const options = await screen.findAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual([
      'BUZPI00Infrastructure / Servers',
    ]);
    await user.keyboard('{Enter}');
    await waitFor(() => expect(location()).toBe('/doc/id-buzpi00'));
    expect(requests.some((r) => r.path.startsWith('/search'))).toBe(false);
  });

  it('switches mode with the shortcut while open', async () => {
    api();
    const { user } = renderApp('/');
    await screen.findByText('Recently updated');
    await user.keyboard('{Control>}k{/Control}');
    await screen.findByRole('combobox', { name: 'Search documentation' });
    await user.keyboard('{Control>}p{/Control}');
    expect(await screen.findByRole('combobox', { name: 'Open document' })).toBeInTheDocument();
  });
});

function indexStatus(rebuild: Partial<IndexStatusResponse['rebuild']> = {}): IndexStatusResponse {
  return {
    documents: 482,
    folders: 12,
    tags: 30,
    issues: [{ code: 'DUPLICATE_ID', path: 'Copy.md', message: 'Id x is also used by A.md' }],
    storage: {
      dataDir: '/data',
      contentDir: '/data/content',
      attachmentsBytes: 5 * 1024 * 1024,
      databaseBytes: 1536,
    },
    rebuild: { state: 'idle', done: 0, total: 0, lastRebuildAt: null, ...rebuild },
  };
}

describe('settings', () => {
  it('shows storage figures (UI_SPEC §86) and rebuilds after confirmation (§87)', async () => {
    let rebuilding = false;
    const requests = api((request) => {
      if (request.method === 'GET' && request.path === '/index/status')
        return {
          body: rebuilding
            ? indexStatus({ state: 'running', done: 182, total: 482 })
            : indexStatus(),
        };
      if (request.method === 'POST' && request.path === '/index/rebuild') {
        rebuilding = true;
        return { status: 202, body: indexStatus({ state: 'running' }).rebuild };
      }
      return undefined;
    });
    const { user } = renderApp('/settings/storage');
    expect(await screen.findByText('/data/content')).toBeInTheDocument();
    expect(screen.getByText('482')).toBeInTheDocument();
    expect(screen.getByText('5.0 MB')).toBeInTheDocument();
    expect(screen.getByText('1.5 KB')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Rebuild index' }));
    const dialog = await screen.findByRole('dialog', { name: 'Rebuild search index?' });
    expect(dialog).toHaveTextContent('Documentation files will not be modified.');
    await user.click(within(dialog).getByRole('button', { name: 'Rebuild' }));
    expect(await screen.findByText('Indexing documents… 182 / 482')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rebuild index' })).toBeDisabled();
    expect(requests.filter((r) => r.path === '/index/rebuild')).toHaveLength(1);
  });

  it('lists index problems and opens from the topbar', async () => {
    api((request) => (request.path === '/index/status' ? { body: indexStatus() } : undefined));
    const { user, location } = renderApp('/');
    await user.click(await screen.findByRole('button', { name: 'Settings' }));
    await waitFor(() => expect(location()).toBe('/settings/general'));
    await user.click(await screen.findByRole('link', { name: 'Index' }));
    expect(await screen.findByText('Duplicate id')).toBeInTheDocument();
    expect(screen.getByText('Copy.md')).toBeInTheDocument();
    expect(screen.getByText(/Never/)).toBeInTheDocument();
  });
});

describe('quickOpen', () => {
  const items = allDocuments(sampleTree());

  it('prefers title prefixes, then subsequences, then path matches', () => {
    expect(quickOpen(items, 'buz').map((item) => item.title)).toEqual(['BUZHULK', 'BUZPI00']);
    expect(quickOpen(items, 'bhk').map((item) => item.title)).toEqual(['BUZHULK']);
    expect(quickOpen(items, 'network').map((item) => item.title)).toEqual(['VLAN']);
    expect(quickOpen(items, 'zzz')).toEqual([]);
  });

  it('returns everything (up to the limit) for an empty query', () => {
    expect(quickOpen(items, '  ', 2)).toHaveLength(2);
  });
});

describe('formatBytes', () => {
  it('uses binary units with one decimal below 10', () => {
    expect([0, 1023, 1024, 1536, 10 * 1024, 5 * 1024 ** 3].map(formatBytes)).toEqual([
      '0 B',
      '1023 B',
      '1.0 KB',
      '1.5 KB',
      '10 KB',
      '5.0 GB',
    ]);
  });
});
