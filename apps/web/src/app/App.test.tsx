import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { documentDto, folder, mockApi, renderApp, sampleTree } from '../test/render';

const recent = {
  items: [
    {
      id: 'id-buzhulk',
      title: 'BUZHULK',
      path: 'Infrastructure/Servers/BUZHULK.md',
      modified: new Date().toISOString(),
    },
  ],
};

describe('navigation tree', () => {
  it('shows the filesystem tree and expands folders on click', async () => {
    mockApi({ 'GET /tree': { root: sampleTree() }, 'GET /documents/recent?limit=10': recent });
    const { user } = renderApp('/');
    const tree = await screen.findByRole('tree', { name: 'Documentation' });
    expect(
      within(tree)
        .getAllByRole('treeitem')
        .map((item) => item.textContent),
    ).toEqual(['Infrastructure', 'Network', 'Read me']);
    await user.click(within(tree).getByRole('treeitem', { name: /Infrastructure/ }));
    expect(within(tree).getByRole('treeitem', { name: /Servers/ })).toHaveAttribute(
      'aria-level',
      '2',
    );
    expect(within(tree).getByRole('treeitem', { name: /Infrastructure/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('supports keyboard navigation (UI_SPEC §95)', async () => {
    mockApi({
      'GET /tree': { root: sampleTree() },
      'GET /documents/recent?limit=10': recent,
      'GET /documents/id-vlan': documentDto('id-vlan', 'Network/VLAN.md'),
    });
    const { user, location } = renderApp('/');
    const tree = await screen.findByRole('tree');
    const first = within(tree).getByRole('treeitem', { name: /Infrastructure/ });
    expect(first).toHaveAttribute('tabindex', '0');
    first.focus();
    await user.keyboard('{ArrowDown}');
    const network = within(tree).getByRole('treeitem', { name: /Network/ });
    expect(network).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(network).toHaveAttribute('aria-expanded', 'true');
    await user.keyboard('{ArrowRight}');
    expect(within(tree).getByRole('treeitem', { name: /VLAN/ })).toHaveFocus();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(location()).toBe('/doc/id-vlan'));
    await user.keyboard('{ArrowLeft}');
    expect(network).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    expect(network).toHaveAttribute('aria-expanded', 'false');
  });

  it('reveals and highlights the open document', async () => {
    mockApi({
      'GET /tree': { root: sampleTree() },
      'GET /documents/id-buzhulk': documentDto('id-buzhulk', 'Infrastructure/Servers/BUZHULK.md'),
    });
    renderApp('/doc/id-buzhulk');
    const item = await screen.findByRole('treeitem', { name: /BUZHULK/ });
    expect(item).toHaveAttribute('aria-selected', 'true');
  });

  it('remembers expanded folders', async () => {
    window.localStorage.setItem('leandocs.tree.expanded', JSON.stringify(['Network']));
    mockApi({ 'GET /tree': { root: sampleTree() }, 'GET /documents/recent?limit=10': recent });
    renderApp('/');
    expect(await screen.findByRole('treeitem', { name: /VLAN/ })).toBeInTheDocument();
  });
});

describe('document page', () => {
  it('shows breadcrumb, title, description, tags and metadata', async () => {
    mockApi({
      'GET /tree': { root: sampleTree() },
      'GET /documents/id-buzhulk': documentDto('id-buzhulk', 'Infrastructure/Servers/BUZHULK.md', {
        content: '# BUZHULK\n\nMain host.\n',
        frontmatter: { description: 'Main Docker and Incus host', tags: ['server', 'docker'] },
      }),
    });
    const { user } = renderApp('/doc/id-buzhulk');
    expect(await screen.findByRole('heading', { level: 1, name: 'BUZHULK' })).toBeInTheDocument();
    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(crumbs).toHaveTextContent('Infrastructure/Servers/BUZHULK');
    expect(screen.getByText('Main Docker and Incus host')).toBeInTheDocument();
    expect(
      within(screen.getByRole('list', { name: 'Tags' })).getAllByRole('listitem'),
    ).toHaveLength(2);
    expect(screen.getByText(/min read/)).toBeInTheDocument();
    expect(document.title).toBe('BUZHULK — LeanDocs');

    await user.click(screen.getByRole('tab', { name: 'Source' }));
    expect(screen.getByLabelText('Markdown source')).toHaveTextContent('# BUZHULK');
  });

  it('shows "Document not found" for unknown ids', async () => {
    mockApi({ 'GET /tree': { root: sampleTree() } });
    renderApp('/doc/missing');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Document not found' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to documentation' })).toHaveAttribute(
      'href',
      '/',
    );
  });

  it('gives unknown addresses a page heading and title', async () => {
    mockApi({ 'GET /tree': { root: sampleTree() }, 'GET /documents/recent?limit=10': recent });
    renderApp('/no-such-page');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Page not found' }),
    ).toBeInTheDocument();
    expect(document.title).toBe('Page not found — LeanDocs');
  });

  it('shows an error state with retry for server errors', async () => {
    mockApi((request) =>
      request.path === '/auth/setup'
        ? { body: { required: false, contentDir: '/data/content' } }
        : request.path === '/auth/session'
          ? { body: { user: { username: 'test-admin' }, csrfToken: 'a'.repeat(64) } }
          : request.path === '/tree'
            ? { body: { root: sampleTree() } }
            : {
                status: 500,
                body: { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
              },
    );
    renderApp('/doc/id-buzhulk');
    expect(await screen.findByText('Unable to load document')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});

describe('home', () => {
  it('lists recently updated documents', async () => {
    mockApi({ 'GET /tree': { root: sampleTree() }, 'GET /documents/recent?limit=10': recent });
    renderApp('/');
    const link = await screen.findByRole('link', { name: /BUZHULK/ });
    expect(link).toHaveAttribute('href', '/doc/id-buzhulk');
    expect(link).toHaveTextContent('Infrastructure / Servers · Updated just now');
  });

  it('shows the empty state when there is no documentation', async () => {
    mockApi({ 'GET /tree': { root: folder('') }, 'GET /documents/recent?limit=10': { items: [] } });
    renderApp('/');
    expect(await screen.findByText('No documentation yet')).toBeInTheDocument();
  });

  it('shows a 404 page for unknown routes', async () => {
    mockApi({ 'GET /tree': { root: sampleTree() } });
    renderApp('/nope');
    expect(await screen.findByText('Page not found')).toBeInTheDocument();
  });
});
