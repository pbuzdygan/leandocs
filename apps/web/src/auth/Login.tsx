import { useEffect, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router';
import { APP_NAME, type SessionResponse, type MfaChallenge } from '@leandocs/shared';
import { api, errorMessage, ApiError } from '../api/client';
import { AppLogo, Wordmark } from '../components/AppLogo';
import { Button } from '../components/ui/Button';
import { TextField, FormError } from '../components/ui/Field';
import { ErrorState, SkeletonLines } from '../components/ui/States';
import { DropdownMenuButton } from '../components/ui/Menu';
import { usePageTitle } from '../utils/page-title';
import './setup.css';

export const sessionKey = ['auth', 'session'] as const;

export function useSession() {
  return useQuery({ queryKey: sessionKey, queryFn: api.session, retry: false });
}

export function AuthGate() {
  const session = useSession();
  const client = useQueryClient();
  const location = useLocation();
  useEffect(() => {
    const expired = () => {
      if (!client.getQueryData<SessionResponse>(sessionKey)?.user) return;
      client.removeQueries({
        predicate: (query) => query.queryKey.join('/') !== sessionKey.join('/'),
      });
      client.setQueryData<SessionResponse>(sessionKey, {
        authMode: client.getQueryData<SessionResponse>(sessionKey)?.authMode ?? 'local',
        user: null,
        csrfToken: '',
      });
      void client.invalidateQueries({ queryKey: sessionKey });
    };
    window.addEventListener('leandocs:unauthorized', expired);
    return () => window.removeEventListener('leandocs:unauthorized', expired);
  }, [client]);
  if (session.isPending)
    return (
      <main className="setup">
        <SkeletonLines />
      </main>
    );
  if (session.isError)
    return (
      <main className="setup">
        <ErrorState
          title="Unable to check session"
          level={1}
          message={errorMessage(session.error)}
          onRetry={() => void session.refetch()}
        />
      </main>
    );
  if (session.data.authMode !== 'none' && !session.data.user)
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}

export function LoginPage() {
  usePageTitle('Sign in');
  const session = useSession();
  const client = useQueryClient();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [challenge, setChallenge] = useState<MfaChallenge | null>(null);
  const [code, setCode] = useState('');
  const [recovery, setRecovery] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Router state is internal, but still reject protocol-relative/external return paths.
  const from = (location.state as { from?: unknown } | null)?.from;
  const destination =
    typeof from === 'string' &&
    from.startsWith('/') &&
    !from.startsWith('//') &&
    !from.includes('\\') &&
    !['/login', '/setup'].includes(from)
      ? from
      : '/';
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving || !session.data?.csrfToken) return;
    setError(null);
    setSaving(true);
    try {
      const result = challenge
        ? await api.verifyMfa(challenge, code.trim(), session.data.csrfToken)
        : await api.login({ username, password }, session.data.csrfToken);
      if ('mfaRequired' in result) {
        setChallenge(result);
        setCode('');
        return;
      }
      client.clear();
      client.setQueryData(sessionKey, result);
    } catch (failure) {
      setError(errorMessage(failure));
      if (failure instanceof ApiError && failure.code === 'MFA_CHALLENGE_EXPIRED')
        setChallenge(null);
      void session.refetch();
    } finally {
      setPassword('');
      setCode('');
      setSaving(false);
    }
  }
  if (session.data?.authMode === 'none' || session.data?.user)
    return <Navigate to={destination} replace />;
  return (
    <main className="setup">
      <div className="setup__content">
        <div className="setup__brand" aria-label={APP_NAME}>
          <AppLogo size={32} />
          <Wordmark />
        </div>
        <h1>Sign in</h1>
        {session.data?.authMode === 'proxy' ? (
          <>
            <p>
              Authentication is managed by your gateway. Open this application through the gateway
              with your authorized account.
            </p>
            <Button onClick={() => void session.refetch()}>Check access again</Button>
          </>
        ) : session.isError ? (
          <ErrorState
            title="Unable to check session"
            message={errorMessage(session.error)}
            onRetry={() => void session.refetch()}
          />
        ) : (
          <form className="setup__form" aria-busy={saving} onSubmit={(event) => void submit(event)}>
            {challenge ? (
              <>
                <p>Enter a code from your authenticator app, or use a recovery code.</p>
                <TextField
                  label={recovery ? 'Recovery code' : 'Authenticator code'}
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  autoComplete="one-time-code"
                  inputMode={recovery ? 'text' : 'numeric'}
                  maxLength={64}
                  required
                  disabled={saving}
                />
                <Button
                  type="button"
                  variant="ghost"
                  disabled={saving}
                  onClick={() => {
                    setRecovery(!recovery);
                    setCode('');
                    setError(null);
                  }}
                >
                  {recovery ? 'Use authenticator code' : 'Use recovery code'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={saving}
                  onClick={() => {
                    setChallenge(null);
                    setCode('');
                    setError(null);
                  }}
                >
                  Start again
                </Button>
              </>
            ) : (
              <>
                <TextField
                  label="Username"
                  autoComplete="username"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  required
                  maxLength={64}
                  disabled={saving}
                />
                <TextField
                  label="Password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  disabled={saving}
                />
              </>
            )}
            <FormError message={error} />
            <Button type="submit" variant="primary" disabled={saving || !session.data?.csrfToken}>
              {saving ? 'Signing in…' : challenge ? 'Verify and sign in' : 'Sign in'}
            </Button>
          </form>
        )}
      </div>
    </main>
  );
}

export function UserMenu() {
  const session = useSession();
  const client = useQueryClient();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  async function logout() {
    if (!session.data || saving) return;
    setSaving(true);
    setError(null);
    try {
      await api.logout(session.data.csrfToken);
      client.clear();
      navigate('/login', { replace: true });
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setSaving(false);
    }
  }
  if (!session.data?.user) return null;
  if (session.data.authMode === 'proxy')
    return (
      <span title="Authentication is managed by your gateway.">{session.data.user.username}</span>
    );
  return (
    <div>
      <DropdownMenuButton
        trigger={
          <Button
            size="small"
            variant="ghost"
            className="user-menu"
            // The visible name is part of the label (WCAG 2.5.3) so voice control can target it.
            aria-label={`User menu (${session.data.user.username})`}
            disabled={saving}
          >
            <span className="user-menu__name">{session.data.user.username}</span>
          </Button>
        }
        entries={[{ label: 'Sign out', onSelect: () => void logout() }]}
      />
      <FormError message={error} />
    </div>
  );
}
