import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { folder, mockApi, renderApp } from '../test/render';

const pending = { required: true };
const contentDir = '/srv/documentation/content';
const token = 'ab'.repeat(32);
const password = 'a long administrator password';

async function fill(
  user: ReturnType<typeof renderApp>['user'],
  confirm = password,
  setupToken = token,
) {
  if (setupToken) await user.type(await screen.findByLabelText('Setup token'), setupToken);
  await user.type(await screen.findByLabelText('Username'), 'admin');
  await user.type(screen.getByLabelText('Password', { exact: true }), password);
  await user.type(screen.getByLabelText('Confirm password'), confirm);
}

describe('first-run setup UI', () => {
  it('redirects to setup, creates an account, shows storage and Ready, and opens login', async () => {
    const requests = mockApi({
      'GET /auth/setup': pending,
      'POST /auth/setup': { required: false, contentDir },
      'GET /auth/session': { user: null, csrfToken: 'a'.repeat(64) },
      'GET /tree': { root: folder('') },
      'GET /documents/recent?limit=10': { items: [] },
    });
    const { user, location } = renderApp('/doc/private');
    // Copied from a log line: surrounding spaces and upper case are accepted.
    await fill(user, password, `  ${token.toUpperCase()} `);
    expect(location()).toBe('/setup');
    expect(screen.queryByRole('tree')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(
      await screen.findByRole('heading', { name: 'Documentation storage' }),
    ).toBeInTheDocument();
    expect(screen.getByText(contentDir)).toBeInTheDocument();
    expect(screen.queryByLabelText('Password', { exact: true })).not.toBeInTheDocument();
    const created = requests.find((request) => request.method === 'POST');
    expect(created?.headers.get('X-LeanDocs-Setup-Token')).toBe(token);
    expect(created?.body).toEqual({
      username: 'admin',
      password,
      confirmPassword: password,
    });
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByRole('heading', { name: 'Ready' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(location()).toBe('/login'));
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByLabelText('Password', { exact: true })).toHaveValue('');
  });

  it('validates confirmation before sending credentials and displays server failures', async () => {
    const requests = mockApi((request) =>
      request.method === 'GET'
        ? { body: pending }
        : {
            status: 500,
            body: { error: { code: 'INTERNAL_ERROR', message: 'Unable to create account' } },
          },
    );
    const { user } = renderApp('/setup');
    await fill(user, 'different password');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Passwords do not match');
    expect(requests.filter((request) => request.method === 'POST')).toHaveLength(0);
    await user.clear(screen.getByLabelText('Confirm password'));
    await user.type(screen.getByLabelText('Confirm password'), password);
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('Unable to create account')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create account' })).toBeEnabled();
  });

  it('asks for the setup token from the server log and reports a wrong one', async () => {
    const requests = mockApi((request) =>
      request.method === 'GET'
        ? { body: pending }
        : {
            status: 403,
            body: {
              error: {
                code: 'INVALID_SETUP_TOKEN',
                message: 'The setup token is not valid. Copy the newest one from the server log.',
              },
            },
          },
    );
    const { user } = renderApp('/setup');
    expect(await screen.findByText('docker compose logs leandocs')).toBeInTheDocument();
    // An empty token is stopped by the required field, a malformed one by the form's check.
    await fill(user, password, '');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    await user.type(screen.getByLabelText('Setup token'), 'not a token');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Enter the 64-character setup token');
    expect(requests.filter((request) => request.method === 'POST')).toHaveLength(0);
    await user.clear(screen.getByLabelText('Setup token'));
    await user.type(screen.getByLabelText('Setup token'), '0'.repeat(64));
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText(/Copy the newest one from the server log/)).toBeInTheDocument();
    expect(screen.getByLabelText('Setup token')).toHaveValue('0'.repeat(64));
  });

  it('does not show account creation on a configured installation', async () => {
    mockApi({});
    renderApp('/setup');
    expect(
      await screen.findByRole('heading', { name: 'Setup already complete' }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Password', { exact: true })).not.toBeInTheDocument();
  });

  it('fails closed and offers retry when setup status cannot be loaded', async () => {
    mockApi(() => ({
      status: 503,
      body: { error: { code: 'UNAVAILABLE', message: 'Server unavailable' } },
    }));
    renderApp('/');
    expect(await screen.findByText('Unable to check setup')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.queryByRole('tree')).not.toBeInTheDocument();
  });
});
