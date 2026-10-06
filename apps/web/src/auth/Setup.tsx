import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate, Outlet, useNavigate } from 'react-router';
import { APP_NAME, validateSetup } from '@leandocs/shared';
import { api, ApiError, errorMessage } from '../api/client';
import { AppLogo, Wordmark } from '../components/AppLogo';
import { Button } from '../components/ui/Button';
import { FormError, TextField } from '../components/ui/Field';
import { ErrorState, SkeletonLines } from '../components/ui/States';
import './setup.css';

const setupKey = ['auth', 'setup'] as const;

function useSetupStatus() {
  return useQuery({ queryKey: setupKey, queryFn: api.setupStatus, staleTime: Infinity });
}

/** The app shell mounts only after local setup or gateway configuration has been checked. */
export function SetupGate() {
  const status = useSetupStatus();
  if (status.isPending)
    return (
      <main className="setup" aria-label="Checking setup">
        <SkeletonLines />
      </main>
    );
  if (status.isError)
    return (
      <main className="setup">
        <ErrorState
          title="Unable to check setup"
          message={errorMessage(status.error)}
          onRetry={() => void status.refetch()}
        />
      </main>
    );
  if (status.data.required) return <Navigate to="/setup" replace />;
  return <Outlet />;
}

export function SetupPage() {
  const status = useSetupStatus();
  const client = useQueryClient();
  const navigate = useNavigate();
  const [step, setStep] = useState<'account' | 'storage' | 'ready'>('account');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving || !status.data?.required) return;
    const input = { username, password, confirmPassword: confirmation };
    const validation = validateSetup(input);
    setError(validation);
    if (validation) return;
    setSaving(true);
    try {
      const completed = await api.createAdministrator(input, status.data.setupToken);
      setPassword('');
      setConfirmation('');
      client.setQueryData(setupKey, completed);
      setStep('storage');
    } catch (failure) {
      setError(errorMessage(failure));
      if (
        failure instanceof ApiError &&
        ['SETUP_COMPLETE', 'INVALID_SETUP_TOKEN'].includes(failure.code)
      )
        void status.refetch();
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
              <h1>Welcome</h1>
              <p>Create your administrator account.</p>
              <form
                onSubmit={(event) => void submit(event)}
                className="setup__form"
                aria-busy={saving}
              >
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
                  hint="Use at least 15 characters. Spaces and Unicode are welcome."
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
                <Button type="submit" variant="primary" disabled={saving}>
                  {saving ? 'Creating account…' : 'Create account'}
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
            <h1>Documentation storage</h1>
            <p>Your documents stay as Markdown files in this folder.</p>
            <code className="setup__path">{status.data.contentDir}</code>
            <Button variant="primary" onClick={() => setStep('ready')}>
              Continue
            </Button>
          </>
        ) : (
          <>
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
