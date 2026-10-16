import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate, Outlet, useNavigate } from 'react-router';
import { APP_NAME, MIN_ACCOUNT_PASSWORD_LENGTH, validateSetup } from '@leandocs/shared';
import { api, ApiError, errorMessage } from '../api/client';
import { AppLogo, Wordmark } from '../components/AppLogo';
import { Button } from '../components/ui/Button';
import { FormError, TextField } from '../components/ui/Field';
import { ErrorState, SkeletonLines } from '../components/ui/States';
import { usePageTitle } from '../utils/page-title';
import { AppLoading } from '../app/AppLoading';
import './setup.css';

const setupKey = ['auth', 'setup'] as const;

/** The token as printed in the server log (ADR-0026); copied text may carry spaces. */
function normalizeToken(value: string): string | null {
  const token = value.trim().toLowerCase();
  return /^[0-9a-f]{64}$/.test(token) ? token : null;
}

function useSetupStatus() {
  return useQuery({ queryKey: setupKey, queryFn: api.setupStatus, staleTime: Infinity });
}

/** The app shell mounts only after local setup or gateway configuration has been checked. */
export function SetupGate() {
  const status = useSetupStatus();
  if (status.isPending) return <AppLoading />;
  if (status.isError)
    return (
      <main className="setup">
        <ErrorState
          title="Unable to check setup"
          level={1}
          message={errorMessage(status.error)}
          onRetry={() => void status.refetch()}
        />
      </main>
    );
  if (status.data.required) return <Navigate to="/setup" replace />;
  return <Outlet />;
}

export function SetupPage() {
  usePageTitle('Setup');
  const status = useSetupStatus();
  const client = useQueryClient();
  const navigate = useNavigate();
  const [step, setStep] = useState<'account' | 'storage' | 'ready'>('account');
  const [token, setToken] = useState('');
  const [contentDir, setContentDir] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving || !status.data?.required) return;
    const input = { username, password, confirmPassword: confirmation };
    const setupToken = normalizeToken(token);
    const validation = setupToken
      ? validateSetup(input)
      : 'Enter the 64-character setup token from the server log.';
    setError(validation);
    if (validation || !setupToken) return;
    setSaving(true);
    try {
      const completed = await api.createAdministrator(input, setupToken);
      setToken('');
      setPassword('');
      setConfirmation('');
      setContentDir(completed.contentDir);
      client.setQueryData(setupKey, { required: false });
      setStep('storage');
    } catch (failure) {
      setError(errorMessage(failure));
      if (failure instanceof ApiError && failure.code === 'SETUP_COMPLETE') void status.refetch();
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="setup">
      <div className="setup__content">
        <div className="setup__brand" aria-label={APP_NAME}>
          <AppLogo size={32} />
          <Wordmark />
        </div>
        {status.isPending ? (
          <SkeletonLines />
        ) : status.isError ? (
          <ErrorState
            title="Unable to load setup"
            level={1}
            message={errorMessage(status.error)}
            onRetry={() => void status.refetch()}
          />
        ) : status.data.authMode === 'none' ? (
          <>
            <h1>Authentication disabled</h1>
            <p>
              This installation does not require an account. Anyone who can reach it can read, edit
              and delete documentation.
            </p>
            <Button onClick={() => navigate('/', { replace: true })}>Open documentation</Button>
          </>
        ) : status.data.authMode === 'proxy' ? (
          <>
            <h1>Authentication managed by gateway</h1>
            <p>Your gateway controls access. No local administrator account is required.</p>
            <Button onClick={() => navigate('/', { replace: true })}>Open documentation</Button>
          </>
        ) : step === 'account' ? (
          status.data.required ? (
            <>
              <p className="setup__step">Step 1 of 3</p>
              <h1>Welcome</h1>
              <p>Create your administrator account.</p>
              <p>
                To prove you run this server, enter the setup token from its log, for example{' '}
                <code>docker compose logs leandocs</code>.
              </p>
              <form
                onSubmit={(event) => void submit(event)}
                className="setup__form"
                aria-busy={saving}
              >
                <TextField
                  label="Setup token"
                  autoComplete="off"
                  spellCheck={false}
                  value={token}
                  onChange={(event) => setToken(event.target.value)}
                  required
                  maxLength={200}
                  hint={
                    <>
                      Also saved in <code>system/setup-token</code> in the data folder. A restart
                      creates a new one.
                    </>
                  }
                  disabled={saving}
                />
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
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  hint={`Use at least ${MIN_ACCOUNT_PASSWORD_LENGTH} characters. Spaces and Unicode are welcome.`}
                  disabled={saving}
                />
                <TextField
                  label="Confirm password"
                  type="password"
                  autoComplete="new-password"
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  required
                  disabled={saving}
                />
                <FormError message={error} />
                <Button type="submit" variant="primary" loading={saving}>
                  Create account
                </Button>
              </form>
            </>
          ) : (
            <>
              <h1>Setup already complete</h1>
              <p>An administrator account already exists.</p>
              <Button onClick={() => navigate('/login', { replace: true })}>Sign in</Button>
            </>
          )
        ) : step === 'storage' ? (
          <>
            <p className="setup__step">Step 2 of 3</p>
            <h1>Documentation storage</h1>
            <p>Your documents stay as Markdown files in this folder.</p>
            <code className="setup__path">{contentDir}</code>
            <Button variant="primary" onClick={() => setStep('ready')}>
              Continue
            </Button>
          </>
        ) : (
          <>
            <p className="setup__step">Step 3 of 3</p>
            <h1>Ready</h1>
            <p>Your administrator account has been created.</p>
            <Button variant="primary" onClick={() => navigate('/login', { replace: true })}>
              Sign in
            </Button>
          </>
        )}
      </div>
    </main>
  );
}
