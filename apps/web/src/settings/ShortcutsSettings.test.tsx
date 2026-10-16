import { screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { folder, mockApi, renderApp } from '../test/render';

describe('help: shortcuts', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('is listed under Help in the settings navigation', async () => {
    mockApi({ 'GET /tree': { root: folder('') } });
    renderApp('/settings/general');
    const help = await screen.findByRole('group', { name: 'Help' });
    expect(within(help).getByRole('link', { name: 'Shortcuts' })).toHaveAttribute(
      'href',
      '/settings/help/shortcuts',
    );
  });

  it('lists the shortcuts by context with Ctrl on Windows and Linux', async () => {
    vi.stubGlobal('navigator', { ...navigator, platform: 'Linux x86_64' });
    mockApi({ 'GET /tree': { root: folder('') } });
    renderApp('/settings/help/shortcuts');
    expect(await screen.findByRole('heading', { level: 2, name: 'Shortcuts' })).toBeInTheDocument();
    expect(document.title).toContain('Shortcuts');
    for (const name of [
      'Everywhere',
      'Navigation tree',
      'Search',
      'Editing (both editors)',
      'Visual editor',
      'Typing Markdown in the visual editor',
      'Source editor',
    ])
      expect(screen.getByRole('table', { name })).toBeInTheDocument();
    const everywhere = screen.getByRole('table', { name: 'Everywhere' });
    const search = within(everywhere)
      .getByText('Search the contents of all documents')
      .closest('tr')!;
    expect(search).toHaveTextContent('Ctrl+K');
    const editing = screen.getByRole('table', { name: 'Editing (both editors)' });
    expect(within(editing).getByText('Redo').closest('tr')).toHaveTextContent('Ctrl+Y');
  });

  it('uses the Apple key names on a Mac', async () => {
    vi.stubGlobal('navigator', { ...navigator, platform: 'MacIntel' });
    mockApi({ 'GET /tree': { root: folder('') } });
    renderApp('/settings/help/shortcuts');
    const editing = await screen.findByRole('table', { name: 'Editing (both editors)' });
    expect(within(editing).getByText('Save now').closest('tr')).toHaveTextContent('⌘+S');
    expect(within(editing).getByText('Redo').closest('tr')).toHaveTextContent('⌘+Shift+Z');
    const visual = screen.getByRole('table', { name: 'Visual editor' });
    expect(within(visual).getByText('Code block').closest('tr')).toHaveTextContent('⌘+Option+C');
  });
});
