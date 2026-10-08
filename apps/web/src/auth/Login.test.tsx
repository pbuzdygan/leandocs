import { act, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { api } from '../api/client';
import { documentDto, folder, mockApi, renderApp } from '../test/render';

const anonymous = { authMode: 'local', user: null, csrfToken: 'a'.repeat(64) };
const authenticated = { authMode: 'local', user: { username: 'admin' }, csrfToken: 'b'.repeat(64) };

describe('local login UI', () => {
  it('signs in and returns to the requested document', async () => {
    let loggedIn = false;
    mockApi((request) => {
      if (request.path === '/auth/session') return { body: loggedIn ? authenticated : anonymous };
      if (request.path === '/auth/login') {
        loggedIn = true;
        return { body: authenticated };
      }
      if (request.path === '/tree') return { body: { root: folder('') } };
      if (request.path === '/documents/a') return { body: documentDto('a', 'Guide.md') };
      return undefined;
    });
    const { user, location } = renderApp('/doc/a');
    await user.type(await screen.findByLabelText('Username'), 'admin');
    await user.type(screen.getByLabelText('Password'), 'a long login passphrase');
    expect(location()).toBe('/login');
    expect(screen.queryByRole('tree')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('heading', { name: 'Guide' })).toBeInTheDocument();
    expect(location()).toBe('/doc/a');
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument();
  });

  it.each([
    [401, 'INVALID_CREDENTIALS', 'Incorrect username or password.'],
    [429, 'LOGIN_RATE_LIMIT', 'Too many sign-in attempts. Try again in 15 seconds.'],
    [429, 'LOGIN_BUSY', 'Sign-in is busy. Try again in a second.'],
  ])('keeps the login form available after %s / %s', async (status, code, message) => {
    const requests = mockApi((request) =>
      request.path === '/auth/session'
        ? { body: anonymous }
        : request.path === '/auth/login'
          ? { status, body: { error: { code, message } } }
          : undefined,
    );
    const { user } = renderApp('/login');
    await user.type(await screen.findByLabelText('Username'), 'admin');
    await user.type(screen.getByLabelText('Password'), 'incorrect');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled();
    expect(screen.getByLabelText('Password')).toHaveValue('');
    expect(requests.filter((request) => request.path === '/auth/login')).toHaveLength(1);
  });

  it('requires the second factor, clears failures and returns to the requested document', async () => {
    let loggedIn = false;
    let attempt = 0;
    const requests = mockApi((request) => {
      if (request.path === '/auth/session') return { body: loggedIn ? authenticated : anonymous };
      if (request.path === '/auth/login')
        return { body: { mfaRequired: true, challenge: 'c'.repeat(64), expiresIn: 300 } };
      if (request.path === '/auth/mfa/verify') {
        if (attempt++ === 0)
          return {
            status: 401,
            body: { error: { code: 'INVALID_MFA_CODE', message: 'Incorrect verification code.' } },
          };
        loggedIn = true;
        return { body: authenticated };
      }
      if (request.path === '/tree') return { body: { root: folder('') } };
      if (request.path === '/documents/a') return { body: documentDto('a', 'Guide.md') };
      return undefined;
    });
    const { user, client, location } = renderApp('/doc/a');
    await user.type(await screen.findByLabelText('Username'), 'admin');
    await user.type(screen.getByLabelText('Password'), 'a long login passphrase');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await user.type(await screen.findByLabelText('Authenticator code'), '000000');
    expect(location()).toBe('/login');
    expect(screen.queryByRole('tree')).not.toBeInTheDocument();
    expect(
      JSON.stringify(
        client
          .getQueryCache()
          .getAll()
          .map((q) => q.state.data),
      ),
    ).not.toContain('mfaRequired');
    await user.click(screen.getByRole('button', { name: 'Verify and sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect verification code.');
    expect(screen.getByLabelText('Authenticator code')).toHaveValue('');
    await user.click(screen.getByRole('button', { name: 'Use recovery code' }));
    await user.type(screen.getByLabelText('Recovery code'), 'one-use-recovery');
    await user.click(screen.getByRole('button', { name: 'Verify and sign in' }));
    expect(await screen.findByRole('heading', { name: 'Guide' })).toBeInTheDocument();
    expect(location()).toBe('/doc/a');
    expect(requests.filter((r) => r.path === '/auth/mfa/verify').map((r) => r.body)).toEqual([
      { challenge: 'c'.repeat(64), code: '000000' },
      { challenge: 'c'.repeat(64), code: 'one-use-recovery' },
    ]);
  });
  it('returns to password entry when the MFA challenge expires', async () => {
    mockApi((request) => {
      if (request.path === '/auth/session') return { body: anonymous };
      if (request.path === '/auth/login')
        return { body: { mfaRequired: true, challenge: 'c'.repeat(64), expiresIn: 300 } };
      if (request.path === '/auth/mfa/verify')
        return {
          status: 401,
          body: {
            error: {
              code: 'MFA_CHALLENGE_EXPIRED',
              message: 'Verification expired. Sign in again.',
            },
          },
        };
      return undefined;
    });
    const { user } = renderApp('/login');
    await user.type(await screen.findByLabelText('Username'), 'admin');
    await user.type(screen.getByLabelText('Password'), 'a long login passphrase');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await user.type(await screen.findByLabelText('Authenticator code'), '123456');
    await user.click(screen.getByRole('button', { name: 'Verify and sign in' }));
    expect(await screen.findByLabelText('Password')).toHaveValue('');
    expect(screen.queryByLabelText('Authenticator code')).not.toBeInTheDocument();
  });
  it('signs out through the user menu and clears cached documents', async () => {
    let loggedIn = true;
    mockApi((request) => {
      if (request.path === '/auth/session') return { body: loggedIn ? authenticated : anonymous };
      if (request.path === '/auth/logout') {
        loggedIn = false;
        return { status: 204 };
      }
      if (request.path === '/tree') return { body: { root: folder('') } };
      if (request.path === '/documents/recent?limit=10') return { body: { items: [] } };
      return undefined;
    });
    const { user, client, location } = renderApp('/');
    await screen.findByText('No documentation yet');
    client.setQueryData(['document', 'private'], { content: 'private content' });
    await user.click(screen.getByRole('button', { name: /^User menu/ }));
    await user.click(screen.getByRole('menuitem', { name: 'Sign out' }));
    await waitFor(() => expect(location()).toBe('/login'));
    expect(await screen.findByLabelText('Username')).toBeInTheDocument();
    expect(client.getQueryData(['document', 'private'])).toBeUndefined();
    expect(screen.queryByRole('tree')).not.toBeInTheDocument();
  });

  it('returns to login and clears cached documents when an API request loses its session', async () => {
    let expired = false;
    mockApi((request) => {
      if (request.path === '/auth/session') return { body: expired ? anonymous : authenticated };
      if (request.path === '/tree')
        return expired
          ? { status: 401, body: { error: { code: 'UNAUTHORIZED', message: 'Sign in' } } }
          : { body: { root: folder('') } };
      if (request.path === '/documents/recent?limit=10') return { body: { items: [] } };
      return undefined;
    });
    const { client, location } = renderApp('/');
    await screen.findByText('No documentation yet');
    client.setQueryData(['document', 'private'], { content: 'private content' });
    expired = true;
    await act(async () => {
      await expect(api.tree()).rejects.toMatchObject({
        status: 401,
        code: 'UNAUTHORIZED',
        message: 'Sign in',
      });
    });
    await waitFor(() => expect(location()).toBe('/login'));
    expect(client.getQueryData(['document', 'private'])).toBeUndefined();
  });
});

describe('proxy authentication UI', () => {
  it('shows gateway instructions without a local login and rechecks access', async () => {
    let authorized = false;
    const requests = mockApi((request) => {
      if (request.path === '/auth/setup')
        return { body: { required: false, contentDir: '/data/content', authMode: 'proxy' } };
      if (request.path === '/auth/session')
        return {
          body: {
            authMode: 'proxy',
            user: authorized ? { username: 'owner@example.com' } : null,
            csrfToken: authorized ? 'c'.repeat(64) : '',
          },
        };
      if (request.path === '/tree') return { body: { root: folder('') } };
      if (request.path === '/documents/a') return { body: documentDto('a', 'Guide.md') };
      return undefined;
    });
    const { user, location } = renderApp('/doc/a');
    expect(
      await screen.findByText(/Authentication is managed by your gateway/),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Username')).not.toBeInTheDocument();
    authorized = true;
    await user.click(screen.getByRole('button', { name: 'Check access again' }));
    expect(await screen.findByRole('heading', { name: 'Guide' })).toBeInTheDocument();
    expect(location()).toBe('/doc/a');
    expect(screen.getByText('owner@example.com')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^User menu/ })).not.toBeInTheDocument();
    expect(requests.some((request) => ['/auth/login', '/auth/logout'].includes(request.path))).toBe(
      false,
    );
  });

  it('explains gateway setup without asking for a local account', async () => {
    mockApi({
      'GET /auth/setup': { required: false, contentDir: '/data/content', authMode: 'proxy' },
    });
    renderApp('/setup');
    expect(
      await screen.findByRole('heading', { name: 'Authentication managed by gateway' }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create account' })).not.toBeInTheDocument();
  });
});
