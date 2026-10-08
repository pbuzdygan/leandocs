import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { documentDto, mockApi, renderApp, sampleTree } from '../test/render';

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

const routes = {
  'GET /tree': { root: sampleTree() },
  'GET /documents/id-vlan': documentDto('id-vlan', 'Network/VLAN.md', {
    title: 'VLAN',
    content: 'See [[BUZHULK]] and [[Old Switch]].\n',
  }),
  'GET /documents/id-vlan/attachments': { items: [] },
  'GET /documents/id-vlan/links': {
    items: [
      {
        kind: 'wiki',
        raw: 'BUZHULK',
        target: { id: 'id-buzhulk', title: 'BUZHULK', path: 'Infrastructure/Servers/BUZHULK.md' },
        count: 1,
      },
      { kind: 'wiki', raw: 'Old Switch', target: null, count: 1 },
    ],
  },
  'GET /documents/id-vlan/backlinks': {
    items: [{ id: 'id-readme', title: 'Read me', path: 'README.md', count: 2 }],
  },
  'GET /links/broken': {
    items: [
      {
        source: { id: 'id-vlan', title: 'VLAN', path: 'Network/VLAN.md' },
        kind: 'wiki',
        raw: 'Old Switch',
      },
      {
        source: { id: 'id-vlan', title: 'VLAN', path: 'Network/VLAN.md' },
        kind: 'markdown',
        raw: '../Gone.md',
      },
    ],
  },
};

describe('Links tab (P9-03)', () => {
  it('shows backlinks and outgoing links, broken ones marked', async () => {
    mockApi(routes);
    const { user, location } = renderApp('/doc/id-vlan');
    await user.click(await screen.findByRole('tab', { name: 'Links' }));
    const referenced = await screen.findByRole('region', { name: 'Referenced by' });
    expect(within(referenced).getByRole('link', { name: 'Read me' })).toBeInTheDocument();
    expect(referenced).toHaveTextContent('2 links');
    const outgoing = screen.getByRole('region', { name: 'Links to' });
    expect(within(outgoing).getByRole('link', { name: 'BUZHULK' })).toBeInTheDocument();
    expect(within(outgoing).getByText('[[Old Switch]]')).toHaveClass('broken-link');
    await user.click(within(outgoing).getByRole('link', { name: 'BUZHULK' }));
    await waitFor(() => expect(location()).toBe('/doc/id-buzhulk'));
  });

  it('remembers the chosen tab', async () => {
    mockApi(routes);
    const { user, unmount } = renderApp('/doc/id-vlan');
    await user.click(await screen.findByRole('tab', { name: 'Links' }));
    unmount();
    renderApp('/doc/id-vlan');
    expect(await screen.findByRole('tab', { name: 'Links' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });
});

describe('Broken links overview (P9-04)', () => {
  it('lists source documents and broken targets', async () => {
    mockApi(routes);
    renderApp('/settings/links');
    const table = await screen.findByRole('table');
    expect(within(table).getAllByRole('link', { name: 'VLAN' })).toHaveLength(2);
    expect(within(table).getByText('[[Old Switch]]')).toBeInTheDocument();
    expect(within(table).getByText('../Gone.md')).toBeInTheDocument();
  });
});
