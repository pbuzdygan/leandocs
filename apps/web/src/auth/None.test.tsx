import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { folder, mockApi, renderApp } from '../test/render';

function installation(mode = 'none') {
  return mockApi((request) => {
    if (request.path === '/auth/setup')
      return { body: { authMode: mode, required: false, contentDir: '/data/content' } };
    if (request.path === '/auth/session')
      return {
        body: {
          authMode: mode,
          user: mode === 'none' ? null : { username: 'admin' },
          csrfToken: 'a'.repeat(64),
        },
      };
    if (request.path === '/index/status')
      return {
        body: {
          documents: 0,
          folders: 0,
          tags: 0,
          issues: [],
          version: 4,
          indexedAt: null,
          storage: {
            dataDir: '/data',
            contentDir: '/data/content',
            attachmentsBytes: 0,
            databaseBytes: 0,
          },
          rebuild: { state: 'idle', done: 0, total: 0, lastRebuildAt: null },
        },
      };
    if (request.path === '/links/broken') return { body: { items: [] } };
    if (request.path === '/tree') return { body: { root: folder('') } };
    if (request.path === '/documents/recent?limit=10') return { body: { items: [] } };
    return undefined;
  });
}

describe('unauthenticated mode UI', () => {
  it('opens the shell without an invented user or a login form', async () => {
    const requests = installation();
    renderApp('/');
    expect(await screen.findByText('No documentation yet')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'User menu' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument();
    expect(
      requests.some((request) => request.method === 'POST' && request.path.startsWith('/auth/')),
    ).toBe(false);
  });
  it('shows a persistent warning in Settings across sections', async () => {
    installation();
    const { user } = renderApp('/settings/storage');
    expect(await screen.findByText('Authentication disabled')).toBeInTheDocument();
    expect(
      screen
        .getByText(/Anyone who can reach this application can read, edit and delete/)
        .closest('[role="alert"]'),
    ).not.toBeNull();
    await user.click(screen.getByRole('link', { name: 'Index' }));
    await screen.findByRole('heading', { name: 'Index' });
    expect(screen.getByText('Authentication disabled')).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Broken links' }));
    expect(screen.getByText('Authentication disabled')).toBeInTheDocument();
  });
  it.each(['local', 'proxy'])('does not show the disabled warning in %s mode', async (mode) => {
    installation(mode);
    renderApp('/settings/storage');
    await screen.findByRole('heading', { name: 'Storage' });
    expect(screen.queryByText('Authentication disabled')).not.toBeInTheDocument();
  });
  it('redirects login to documentation and explains setup without an account', async () => {
    installation();
    const first = renderApp('/login');
    expect(await screen.findByText('No documentation yet')).toBeInTheDocument();
    expect(first.location()).toBe('/');
    first.unmount();
    const { user, location } = renderApp('/setup');
    expect(
      await screen.findByRole('heading', { name: 'Authentication disabled' }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Open documentation' }));
    expect(await screen.findByText('No documentation yet')).toBeInTheDocument();
    expect(location()).toBe('/');
  });
});
