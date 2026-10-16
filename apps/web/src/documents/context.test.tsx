import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { documentDto, mockApi, renderApp, sampleTree } from '../test/render';

const ID = 'id-atlas';

function api() {
  mockApi((request) => {
    if (request.path === '/tree') return { body: { root: sampleTree() } };
    if (request.path === `/documents/${ID}`)
      return {
        body: documentDto(ID, 'Infrastructure/Servers/ATLAS.md', {
          content: '# ATLAS\n\n## Hardware\n\nText.\n',
        }),
      };
    if (request.path.startsWith('/documents/recent')) return { body: { items: [] } };
    if (request.path === '/pins') return { body: { items: [] } };
    return undefined;
  });
}

describe('context panel (UI_SPEC §43–48, §108)', () => {
  it('lists Contents, Info and Links in that order and moves between them with arrows', async () => {
    api();
    const { user } = renderApp(`/doc/${ID}`);
    const panel = await screen.findByRole('complementary', { name: 'Document context' });
    const tabs = within(panel).getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Contents', 'Info', 'Links']);
    tabs[0]!.focus();
    await user.keyboard('{ArrowRight}');
    expect(tabs[1]).toHaveFocus();
    expect(tabs[1]).toHaveAttribute('aria-selected', 'true');
    expect(within(panel).getByRole('tabpanel')).toHaveAccessibleName('Info');
  });

  it('is resizable from the keyboard and remembers its width', async () => {
    api();
    const { user } = renderApp(`/doc/${ID}`);
    const panel = await screen.findByRole('complementary', { name: 'Document context' });
    const handle = within(panel).getByRole('separator', { name: 'Resize side panel' });
    expect(handle).toHaveAttribute('aria-valuenow', '260');
    handle.focus();
    // The handle is on the left edge: moving it left makes the panel wider.
    await user.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(handle).toHaveAttribute('aria-valuenow', '292');
    expect(panel).toHaveStyle({ width: '292px' });
    expect(window.localStorage.getItem('leandocs.context.width')).toBe('292');
  });
});
