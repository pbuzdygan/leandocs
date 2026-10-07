import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { documentDto, mockApi, renderApp, sampleTree } from '../test/render';

/** P16-02 (UI_SPEC §98–106). Widths are answered by the matchMedia stub in test/setup.ts. */

const ID = 'id-buzhulk';
const CONTENT = '# BUZHULK\n\n## Hardware\n\nText.\n\n## Network\n\nText.\n';

function api() {
  mockApi((request) => {
    if (request.path === '/tree') return { body: { root: sampleTree() } };
    if (request.path === `/documents/${ID}`)
      return {
        body: documentDto(ID, 'Infrastructure/Servers/BUZHULK.md', { content: CONTENT }),
      };
    if (request.path.startsWith('/documents/recent')) return { body: { items: [] } };
    if (request.path === '/pins') return { body: { items: [] } };
    return undefined;
  });
}

describe('context panel', () => {
  it('sits beside the document on wide screens', async () => {
    api();
    renderApp(`/doc/${ID}`);
    expect(await screen.findByRole('complementary', { name: 'Document context' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Contents, links and info' })).toBeNull();
  });

  it('opens as a drawer below 1200 px and closes when a heading is chosen', async () => {
    window.innerWidth = 1024;
    api();
    const { user } = renderApp(`/doc/${ID}`);
    await screen.findByRole('heading', { level: 1, name: 'BUZHULK' });
    expect(screen.queryByRole('complementary', { name: 'Document context' })).toBeNull();
    const opener = screen.getByRole('button', { name: 'Contents, links and info' });
    await user.click(opener);
    const drawer = await screen.findByRole('dialog', { name: 'Document context' });
    await user.keyboard('{Escape}');
    await waitFor(() => expect(drawer).not.toBeInTheDocument());
    expect(opener).toHaveFocus();

    await user.click(opener);
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('link', { name: 'Network' }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('heading', { level: 2, name: 'Network' })).toHaveFocus();
  });
});

describe('phone navigation drawer', () => {
  it('is inert while closed, takes focus when opened and closes with Esc', async () => {
    window.innerWidth = 390;
    api();
    const { user } = renderApp(`/doc/${ID}`);
    await screen.findByRole('heading', { level: 1, name: 'BUZHULK' });
    const drawer = document.getElementById('navigation-drawer')!;
    expect(drawer).toHaveAttribute('inert');

    const menu = screen.getByRole('button', { name: 'Open navigation' });
    await user.click(menu);
    expect(drawer).not.toHaveAttribute('inert');
    await waitFor(() =>
      expect(within(drawer).getByRole('treeitem', { name: /BUZHULK/ })).toHaveFocus(),
    );
    await user.keyboard('{Escape}');
    expect(drawer).toHaveAttribute('inert');
    expect(screen.getByRole('button', { name: 'Open navigation' })).toHaveFocus();
  });

  it('closes when the page changes', async () => {
    window.innerWidth = 390;
    api();
    const { user, location } = renderApp(`/doc/${ID}`);
    await screen.findByRole('heading', { level: 1, name: 'BUZHULK' });
    await user.click(screen.getByRole('button', { name: 'Open navigation' }));
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    await waitFor(() => expect(location()).toBe('/settings/general'));
    expect(document.getElementById('navigation-drawer')).toHaveAttribute('inert');
  });
});
