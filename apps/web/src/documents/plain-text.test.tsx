import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { documentDto, mockApi, renderApp, sampleTree, setTestSettings } from '../test/render';

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

/** ADR-0025: documents the server could not analyse safely are never parsed in the browser. */
describe('documents read as plain text', () => {
  const limited = documentDto('id-vlan', 'Network/VLAN.md', {
    content: '# Heading\n\nSome **bold** text.\n',
    analysisLimited: 'larger than 2 MiB',
  });

  function api() {
    return mockApi((request) => {
      if (request.path === '/tree') return { body: { root: sampleTree() } };
      if (request.path === '/documents/id-vlan') return { body: limited };
      if (request.path === '/documents/id-vlan/attachments') return { body: { items: [] } };
      return undefined;
    });
  }

  it('shows the source as plain text with the reason', async () => {
    api();
    renderApp('/doc/id-vlan');
    expect(
      await screen.findByText(/This document is larger than 2 MiB, so it is shown as plain text/),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Markdown source')).toHaveTextContent(
      '# Heading Some **bold** text.',
    );
    expect(screen.queryByRole('heading', { name: 'Heading' })).not.toBeInTheDocument();
  });

  it('edits in Source mode only', async () => {
    setTestSettings({ editor: { defaultMode: 'visual' } });
    api();
    renderApp('/doc/id-vlan/edit');
    expect(await screen.findByRole('tab', { name: 'Visual' })).toBeDisabled();
    expect(screen.getByRole('tab', { name: 'Source' })).toHaveAttribute('aria-selected', 'true');
  });
});
