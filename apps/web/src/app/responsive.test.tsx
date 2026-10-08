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

describe('navigation sidebar on wider screens', () => {
  it('can be hidden and shown again, and stays as chosen (UI_SPEC §160)', async () => {
    api();
    const { user, unmount } = renderApp(`/doc/${ID}`);
    await screen.findByRole('heading', { level: 1, name: 'BUZHULK' });
    const sidebar = document.getElementById('navigation-drawer')!;
    const hide = screen.getByRole('button', { name: 'Hide navigation' });
    expect(hide).toHaveAttribute('aria-expanded', 'true');
    expect(hide).toHaveAttribute('aria-controls', 'navigation-drawer');
    expect(sidebar).not.toHaveClass('sidebar--hidden');

    await user.click(hide);
    // `display: none` in CSS: out of view, out of the tab order and the accessibility tree.
    expect(sidebar).toHaveClass('sidebar--hidden');
    const show = screen.getByRole('button', { name: 'Show navigation' });
    expect(show).toHaveAttribute('aria-expanded', 'false');
    expect(window.localStorage.getItem('leandocs.sidebar.hidden')).toBe('true');

    unmount();
    api();
    renderApp(`/doc/${ID}`);
    await screen.findByRole('heading', { level: 1, name: 'BUZHULK' });
    expect(document.getElementById('navigation-drawer')).toHaveClass('sidebar--hidden');
    await user.click(screen.getByRole('button', { name: 'Show navigation' }));
    expect(document.getElementById('navigation-drawer')).not.toHaveClass('sidebar--hidden');
  });

  it('resizes with the keyboard within 220–400 px and remembers the width (UI_SPEC §17)', async () => {
    api();
    const { user } = renderApp(`/doc/${ID}`);
    await screen.findByRole('heading', { level: 1, name: 'BUZHULK' });
    const separator = screen.getByRole('separator', { name: 'Resize navigation' });
    const sidebar = document.getElementById('navigation-drawer')!;
    expect(separator).toHaveAttribute('aria-valuenow', '280');
    separator.focus();
    await user.keyboard('{ArrowRight}{ArrowRight}');
    expect(separator).toHaveAttribute('aria-valuenow', '312');
    expect(sidebar.style.width).toBe('312px');
    expect(window.localStorage.getItem('leandocs.sidebar.width')).toBe('312');
    for (let i = 0; i < 20; i++) await user.keyboard('{ArrowRight}');
    expect(separator).toHaveAttribute('aria-valuenow', '400');
    for (let i = 0; i < 20; i++) await user.keyboard('{ArrowLeft}');
    expect(separator).toHaveAttribute('aria-valuenow', '220');
    await user.dblClick(separator);
    expect(separator).toHaveAttribute('aria-valuenow', '280');
  });
});
