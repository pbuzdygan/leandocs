import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { sessionKey } from '../auth/Login';
import { folder, mockApi, renderApp } from '../test/render';

const session = { authMode: 'local', user: { username: 'owner' }, csrfToken: 'b'.repeat(64) };
const secret = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
/** The page has two "Current password" fields: one for the password, one for two-factor setup. */
const mfa = async () =>
  within(await screen.findByRole('region', { name: 'Two-factor authentication' }));
describe('security settings', () => {
  it('confirms enrollment before activation and shows recovery codes once without caching them', async () => {
    let enabled = false;
    const requests = mockApi((request) => {
      if (request.path === '/tree') return { body: { root: folder('') } };
      if (request.path === '/auth/mfa/status')
        return { body: { enabled, recoveryCodesRemaining: enabled ? 10 : 0 } };
      if (request.path === '/auth/mfa/enroll')
        return { body: { secret, qrCode: 'data:image/png;base64,abc', expiresIn: 300 } };
      if (request.path === '/auth/mfa/confirm') {
        enabled = true;
        return {
          body: { session, recoveryCodes: ['private-recovery-one', 'private-recovery-two'] },
        };
      }
      return undefined;
    });
    const { user, client } = renderApp('/settings/security');
    await user.type(
      await (await mfa()).findByLabelText('Current password'),
      'my current passphrase',
    );
    await user.click(screen.getByRole('button', { name: 'Set up two-factor authentication' }));
    expect(await screen.findByLabelText('Manual setup key')).toHaveTextContent(secret);
    expect(screen.getByRole('img', { name: 'Authenticator enrollment QR code' })).toHaveAttribute(
      'src',
      'data:image/png;base64,abc',
    );
    expect(screen.getByText('Not enabled.')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Authenticator code'), '123456');
    await user.click(screen.getByRole('button', { name: 'Confirm and enable' }));
    expect(await screen.findByLabelText('Recovery codes')).toHaveTextContent(
      'private-recovery-one',
    );
    await waitFor(() =>
      expect(screen.getByText('Enabled. 10 recovery codes remaining.')).toBeInTheDocument(),
    );
    expect(
      JSON.stringify(
        client
          .getQueryCache()
          .getAll()
          .map((q) => q.state.data),
      ),
    ).not.toContain('private-recovery');
    expect(
      JSON.stringify(
        client
          .getQueryCache()
          .getAll()
          .map((q) => q.state.data),
      ),
    ).not.toContain(secret);
    await user.click(screen.getByRole('button', { name: 'I have saved my recovery codes' }));
    expect(screen.queryByLabelText('Recovery codes')).not.toBeInTheDocument();
    expect((await mfa()).getByLabelText('Current password')).toHaveValue('');
    expect(requests.find((r) => r.path === '/auth/mfa/confirm')?.body).toEqual({ code: '123456' });
  });
  it('keeps the authenticated session after a bad factor and reauthenticates disablement', async () => {
    let enabled = true;
    let attempt = 0;
    mockApi((request) => {
      if (request.path === '/tree') return { body: { root: folder('') } };
      if (request.path === '/auth/mfa/status')
        return { body: { enabled, recoveryCodesRemaining: 2 } };
      if (request.path === '/auth/mfa/disable') {
        if (attempt++ === 0)
          return {
            status: 401,
            body: { error: { code: 'INVALID_MFA_CODE', message: 'Incorrect verification code.' } },
          };
        enabled = false;
        return { body: session };
      }
      return undefined;
    });
    const { user, location } = renderApp('/settings/security');
    await user.type(
      await (await mfa()).findByLabelText('Current password'),
      'my current passphrase',
    );
    await user.type(screen.getByLabelText('Authenticator or recovery code'), 'bad');
    await user.click(screen.getByRole('button', { name: 'Disable two-factor authentication' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect verification code.');
    expect(location()).toBe('/settings/security');
    expect((await mfa()).getByLabelText('Current password')).toHaveValue('');
    expect(screen.getByLabelText('Authenticator or recovery code')).toHaveValue('');
    await user.type((await mfa()).getByLabelText('Current password'), 'my current passphrase');
    await user.type(screen.getByLabelText('Authenticator or recovery code'), 'unused recovery');
    await user.click(screen.getByRole('button', { name: 'Disable two-factor authentication' }));
    expect(await screen.findByText('Not enabled.')).toBeInTheDocument();
  });
  it('cancels enrollment on the server and clears the displayed setup secret', async () => {
    const requests = mockApi((request) => {
      if (request.path === '/tree') return { body: { root: folder('') } };
      if (request.path === '/auth/mfa/status')
        return { body: { enabled: false, recoveryCodesRemaining: 0 } };
      if (request.path === '/auth/mfa/enroll')
        return request.method === 'DELETE'
          ? { status: 204 }
          : { body: { secret, qrCode: 'data:image/png;base64,abc', expiresIn: 300 } };
      return undefined;
    });
    const { user } = renderApp('/settings/security');
    await user.type(
      await (await mfa()).findByLabelText('Current password'),
      'my current passphrase',
    );
    await user.click(screen.getByRole('button', { name: 'Set up two-factor authentication' }));
    await user.click(await screen.findByRole('button', { name: 'Cancel enrollment' }));
    await waitFor(() =>
      expect(screen.queryByLabelText('Manual setup key')).not.toBeInTheDocument(),
    );
    expect(requests.some((r) => r.method === 'DELETE' && r.path === '/auth/mfa/enroll')).toBe(true);
  });
  it.each(['proxy', 'none'])('does not call local MFA endpoints in %s mode', async (authMode) => {
    const requests = mockApi({
      'GET /auth/session': {
        authMode,
        user: authMode === 'proxy' ? { username: 'owner' } : null,
        csrfToken: 'a'.repeat(64),
      },
    });
    renderApp('/settings/security');
    expect(
      await screen.findByText(
        authMode === 'proxy'
          ? 'Passwords and two-factor authentication are managed by your gateway.'
          : 'Enable local authentication to use a password and two-factor authentication.',
      ),
    ).toBeInTheDocument();
    expect(requests.some((r) => r.path.startsWith('/auth/mfa/'))).toBe(false);
  });

  it('changes the password with the current one and keeps this browser signed in (P16-10)', async () => {
    const renewed = { ...session, csrfToken: 'c'.repeat(64) };
    const requests = mockApi((request) => {
      if (request.path === '/tree') return { body: { root: folder('') } };
      if (request.path === '/auth/mfa/status')
        return { body: { enabled: false, recoveryCodesRemaining: 0 } };
      if (request.path === '/auth/password') {
        const body = request.body as { currentPassword: string };
        return body.currentPassword === 'my current passphrase'
          ? { body: renewed }
          : {
              status: 401,
              body: {
                error: {
                  code: 'INVALID_CREDENTIALS',
                  message: 'The current password is incorrect.',
                },
              },
            };
      }
      return undefined;
    });
    const { user, client, location } = renderApp('/settings/security');
    const form = within(await screen.findByRole('region', { name: 'Password' }));
    const current = form.getByLabelText('Current password');
    const next = form.getByLabelText('New password');
    const confirm = form.getByLabelText('Confirm new password');
    expect(next).toHaveAccessibleDescription('At least 15 characters.');

    // Checked in the browser first: nothing is sent.
    await user.type(current, 'my current passphrase');
    await user.type(next, 'short');
    await user.type(confirm, 'short');
    await user.click(form.getByRole('button', { name: 'Change password' }));
    expect(await form.findByText('Password must contain at least 15 characters.')).toBeVisible();
    expect(requests.some((request) => request.path === '/auth/password')).toBe(false);

    // A wrong current password is reported in the form and does not sign out.
    await user.clear(next);
    await user.clear(confirm);
    await user.type(next, 'my brand new passphrase');
    await user.type(confirm, 'my brand new passphrase');
    await user.clear(current);
    await user.type(current, 'not my passphrase');
    await user.click(form.getByRole('button', { name: 'Change password' }));
    expect(await form.findByText('The current password is incorrect.')).toBeVisible();
    expect(current).toHaveValue('');
    expect(location()).toBe('/settings/security');

    await user.type(current, 'my current passphrase');
    await user.click(form.getByRole('button', { name: 'Change password' }));
    expect(
      await form.findByText('Password changed. Other browsers and devices have been signed out.'),
    ).toBeVisible();
    expect(requests.filter((request) => request.path === '/auth/password').at(-1)?.body).toEqual({
      currentPassword: 'my current passphrase',
      newPassword: 'my brand new passphrase',
      confirmPassword: 'my brand new passphrase',
    });
    expect([current, next, confirm].map((field) => (field as HTMLInputElement).value)).toEqual([
      '',
      '',
      '',
    ]);
    // The new session (new CSRF token) is used from now on.
    expect(client.getQueryData(sessionKey)).toEqual(renewed);
  });
});
