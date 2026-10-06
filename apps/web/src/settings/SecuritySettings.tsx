import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { MfaEnrollment, SessionResponse } from '@leandocs/shared';
import { api, errorMessage } from '../api/client';
import { sessionKey, useSession } from '../auth/Login';
import { Button } from '../components/ui/Button';
import { TextField, FormError } from '../components/ui/Field';

export function SecuritySettings() {
  const session = useSession();
  if (session.data?.authMode !== 'local')
    return (
      <section>
        <h2 className="settings__title">Security</h2>
        <p className="settings__note">
          {session.data?.authMode === 'proxy'
            ? 'Two-factor authentication is managed by your gateway.'
            : 'Enable local authentication to use two-factor authentication.'}
        </p>
      </section>
    );
  return <LocalSecurity />;
}
function LocalSecurity() {
  const client = useQueryClient();
  const status = useQuery({ queryKey: ['mfa-status'], queryFn: api.mfaStatus, retry: false });
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [enrollment, setEnrollment] = useState<MfaEnrollment | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const updateSession = (value: SessionResponse) => {
    client.setQueryData(sessionKey, value);
  };
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (enrollment) {
        const result = await api.confirmMfa(code.trim());
        setEnrollment(null);
        setCodes(result.recoveryCodes);
        updateSession(result.session);
      } else if (status.data?.enabled) {
        const result = await api.disableMfa(password, code.trim());
        setCodes(null);
        updateSession(result);
      } else setEnrollment(await api.enrollMfa(password));
      void status.refetch();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setPassword('');
      setCode('');
      setBusy(false);
    }
  }
  return (
    <section className="settings__section">
      <h2 className="settings__title">Security</h2>
      <h3 className="settings__subtitle">Two-factor authentication</h3>
      <p className="settings__note">
        Use Microsoft Authenticator or another compatible authenticator app to protect local
        sign-in.
      </p>
      {status.isPending ? (
        <p className="settings__note">Checking security settings…</p>
      ) : status.isError ? (
        <>
          <FormError message={errorMessage(status.error)} />
          <Button onClick={() => void status.refetch()}>Retry</Button>
        </>
      ) : (
        <>
          <p className="settings__note">
            {status.data.enabled
              ? `Enabled. ${status.data.recoveryCodesRemaining} recovery codes remaining.`
              : 'Not enabled.'}
          </p>
          {codes ? (
            <div>
              <h3 className="settings__subtitle">Save your recovery codes</h3>
              <p className="settings__note">
                Each code works once. Store these codes safely; they will not be shown again.
              </p>
              <pre className="settings__recovery-codes" aria-label="Recovery codes">
                {codes.join('\n')}
              </pre>
              <Button onClick={() => setCodes(null)}>I have saved my recovery codes</Button>
            </div>
          ) : (
            <form
              className="settings__mfa-form"
              onSubmit={(event) => void submit(event)}
              aria-busy={busy}
            >
              {enrollment ? (
                <>
                  <p className="settings__note">
                    Scan this QR code in your authenticator app, then enter its six-digit code.
                    Enrollment expires after five minutes.
                  </p>
                  <img
                    src={enrollment.qrCode}
                    alt="Authenticator enrollment QR code"
                    width="256"
                    height="256"
                  />
                  <p className="settings__note">
                    Manual setup key:{' '}
                    <code className="settings__mfa-key" aria-label="Manual setup key">
                      {enrollment.secret}
                    </code>
                  </p>
                  <TextField
                    label="Authenticator code"
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    required
                    disabled={busy}
                  />
                  <Button type="submit" disabled={busy}>
                    Confirm and enable
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => {
                      setBusy(true);
                      void api
                        .cancelMfaEnrollment()
                        .then(() => {
                          setEnrollment(null);
                          setCode('');
                          setError(null);
                        })
                        .catch((failure: unknown) => setError(errorMessage(failure)))
                        .finally(() => setBusy(false));
                    }}
                  >
                    Cancel enrollment
                  </Button>
                </>
              ) : (
                <>
                  {status.data.enabled && (
                    <p className="settings__note">
                      Disabling removes the extra sign-in protection. Confirm your password and an
                      unused authenticator or recovery code. Other sessions will be signed out.
                    </p>
                  )}
                  <TextField
                    label="Current password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                    disabled={busy}
                  />
                  {status.data.enabled && (
                    <TextField
                      label="Authenticator or recovery code"
                      value={code}
                      onChange={(event) => setCode(event.target.value)}
                      autoComplete="one-time-code"
                      maxLength={64}
                      required
                      disabled={busy}
                    />
                  )}
                  <Button type="submit" disabled={busy}>
                    {busy
                      ? 'Checking…'
                      : status.data.enabled
                        ? 'Disable two-factor authentication'
                        : 'Set up two-factor authentication'}
                  </Button>
                </>
              )}
            </form>
          )}
        </>
      )}
      <FormError message={error} />
    </section>
  );
}
