import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { folder, mockApi, renderApp } from '../test/render';

const session = { authMode: 'local', user: { username: 'owner' }, csrfToken: 'b'.repeat(64) };
const secret = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
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
    await user.type(await screen.findByLabelText('Current password'), 'my current passphrase');
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
    expect(screen.getByLabelText('Current password')).toHaveValue('');
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
    await user.type(await screen.findByLabelText('Current password'), 'my current passphrase');
    await user.type(screen.getByLabelText('Authenticator or recovery code'), 'bad');
    await user.click(screen.getByRole('button', { name: 'Disable two-factor authentication' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect verification code.');
    expect(location()).toBe('/settings/security');
    expect(screen.getByLabelText('Current password')).toHaveValue('');
    expect(screen.getByLabelText('Authenticator or recovery code')).toHaveValue('');
    await user.type(screen.getByLabelText('Current password'), 'my current passphrase');
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
    await user.type(await screen.findByLabelText('Current password'), 'my current passphrase');
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
          ? 'Two-factor authentication is managed by your gateway.'
          : 'Enable local authentication to use two-factor authentication.',
      ),
    ).toBeInTheDocument();
    expect(requests.some((r) => r.path.startsWith('/auth/mfa/'))).toBe(false);
  });
});
