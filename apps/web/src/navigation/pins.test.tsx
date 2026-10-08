import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockApi, renderApp, sampleTree } from '../test/render';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('pins (P10-05)', () => {
  it('pins from the tree menu and lists pinned documents in the sidebar and on Home', async () => {
    let pinned: { id: string; title: string; path: string }[] = [];
    const requests = mockApi((request) => {
      if (request.path === '/tree') return { body: { root: sampleTree() } };
      if (request.path === '/documents/recent?limit=10') return { body: { items: [] } };
      if (request.path === '/pins') return { body: { items: pinned } };
      if (request.method === 'PUT' && request.path === '/pins/id-readme') {
        pinned = [{ id: 'id-readme', title: 'Read me', path: 'README.md' }];
        return { status: 204 };
      }
      return undefined;
    });
    const { user } = renderApp('/');
    await screen.findByText('Recently updated');
    expect(screen.queryByRole('navigation', { name: 'Pinned documents' })).toBeNull();

    const item = await screen.findByRole('treeitem', { name: /Read me/ });
    await user.pointer({ keys: '[MouseRight]', target: item });
    await user.click(await screen.findByRole('menuitem', { name: 'Pin' }));

    const sidebar = await screen.findByRole('navigation', { name: 'Pinned documents' });
    expect(within(sidebar).getByRole('link', { name: 'Read me' })).toHaveAttribute(
      'href',
      '/doc/id-readme',
    );
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Pinned' })).toHaveTextContent('Read me'),
    );
    expect(requests.some((r) => r.method === 'PUT' && r.path === '/pins/id-readme')).toBe(true);
  });
});
