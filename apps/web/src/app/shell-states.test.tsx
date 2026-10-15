import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { doc, documentDto, folder, mockApi, renderApp } from '../test/render';

/** Shell states from the UI guidelines alignment (WP2): loading, empty folder, breadcrumb. */

const ID = 'id-atlas';

function tree() {
  return folder('', [
    folder('Infrastructure', [
      folder('Infrastructure/Servers', [doc('Infrastructure/Servers/ATLAS.md', ID)]),
      folder('Infrastructure/Storage'),
    ]),
  ]);
}

function api(
  extra: (path: string) => { status?: number; body?: unknown } | undefined = () => undefined,
) {
  return mockApi((request) => {
    const answer = extra(request.path);
    if (answer) return answer;
    if (request.path === '/tree') return { body: { root: tree() } };
    if (request.path === `/documents/${ID}`)
      return { body: documentDto(ID, 'Infrastructure/Servers/ATLAS.md') };
    if (request.path.startsWith('/documents/recent')) return { body: { items: [] } };
    if (request.path === '/pins') return { body: { items: [] } };
    return undefined;
  });
}

describe('initial loading (UI_SPEC §78)', () => {
  it('shows the mark and "Loading documentation…" while the setup is checked', async () => {
    // No answer: the first check stays pending.
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    );
    renderApp('/');
    expect(await screen.findByRole('status')).toHaveTextContent('Loading documentation…');
  });
});

describe('empty folder (UI_SPEC §74)', () => {
  it('says the open folder is empty and offers to create content in it', async () => {
    window.localStorage.setItem(
      'leandocs.tree.expanded',
      JSON.stringify(['Infrastructure', 'Infrastructure/Storage']),
    );
    api();
    const { user } = renderApp('/');
    const empty = await screen.findByRole('group', { name: 'Storage is empty' });
    expect(empty).toHaveTextContent('This folder is empty.');
    await user.click(within(empty).getByRole('button', { name: 'Create document' }));
    const dialog = await screen.findByRole('dialog', { name: 'New document' });
    expect(within(dialog).getByLabelText('Location')).toHaveValue('Infrastructure/Storage');
  });

  it('shows nothing extra for folders with content', async () => {
    window.localStorage.setItem('leandocs.tree.expanded', JSON.stringify(['Infrastructure']));
    api();
    renderApp('/');
    await screen.findByRole('treeitem', { name: 'Servers' });
    expect(screen.queryByRole('group', { name: /is empty/ })).toBeNull();
  });
});

describe('breadcrumb', () => {
  it('shows the folder in the hidden sidebar and focuses its row', async () => {
    window.localStorage.setItem('leandocs.sidebar.hidden', 'true');
    api();
    const { user } = renderApp(`/doc/${ID}`);
    await screen.findByRole('heading', { level: 1, name: 'ATLAS' });
    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' });
    await user.click(within(crumbs).getByRole('button', { name: 'Infrastructure' }));
    const row = await screen.findByRole('treeitem', { name: 'Infrastructure' });
    await waitFor(() => expect(row).toHaveFocus());
    expect(screen.getByRole('button', { name: 'Hide navigation' })).toBeInTheDocument();
  });

  it('opens the navigation drawer on phones', async () => {
    window.innerWidth = 390;
    api();
    const { user } = renderApp(`/doc/${ID}`);
    await screen.findByRole('heading', { level: 1, name: 'ATLAS' });
    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' });
    await user.click(within(crumbs).getByRole('button', { name: 'Servers' }));
    expect(screen.getByRole('button', { name: 'Close navigation' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    await waitFor(() => expect(screen.getByRole('treeitem', { name: 'Servers' })).toHaveFocus());
  });
});

describe('sign-out failure', () => {
  it('is reported as a toast, not inside the topbar', async () => {
    api((path) =>
      path === '/auth/logout'
        ? { status: 500, body: { error: { code: 'INTERNAL', message: 'Server unavailable' } } }
        : undefined,
    );
    const { user } = renderApp('/');
    await user.click(await screen.findByRole('button', { name: /^User menu/ }));
    await user.click(screen.getByRole('menuitem', { name: 'Sign out' }));
    expect(await screen.findByText(/Could not sign out: Server unavailable/)).toBeInTheDocument();
    expect(within(screen.getByRole('banner')).queryByRole('alert')).toBeNull();
  });
});
