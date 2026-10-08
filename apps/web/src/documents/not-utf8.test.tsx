import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { documentDto, mockApi, renderApp, sampleTree } from '../test/render';

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

/** P15-03: the server never writes a file that is not UTF-8, so the page offers no editor. */
describe('documents that are not UTF-8', () => {
  const legacy = documentDto('id-vlan', 'Network/VLAN.md', {
    content: '# Zr�d�o\n',
    notUtf8: true,
  });

  function api() {
    return mockApi((request) => {
      if (request.path === '/tree') return { body: { root: sampleTree() } };
      if (request.path === '/documents/id-vlan') return { body: legacy };
      if (request.path === '/documents/id-vlan/attachments') return { body: { items: [] } };
      return undefined;
    });
  }

  it('explain why they cannot be edited and disable Edit', async () => {
    api();
    renderApp('/doc/id-vlan');
    expect(await screen.findByText(/This file is not saved as UTF-8 text/)).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Edit' })).toBeDisabled();
  });

  it('open read-only even from an edit link', async () => {
    api();
    renderApp('/doc/id-vlan/edit');
    expect(await screen.findByRole('tab', { name: 'Edit' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
  });
});
