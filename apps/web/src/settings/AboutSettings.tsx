import { APP_NAME, APP_REPOSITORY_URL, APP_TAGLINE, APP_VERSION } from '@leandocs/shared';
import { useHealth } from '../api/queries';
import { AppLogo, Wordmark } from '../components/AppLogo';
import { Button } from '../components/ui/Button';

/**
 * UI_SPEC §88: product, versions and links. The frontend version is baked into this bundle; the
 * server version comes from the health endpoint, so a stale browser tab shows the difference.
 */
export function AboutSettings() {
  const health = useHealth();
  const serverVersion = health.data?.version;
  const outdated = serverVersion !== undefined && serverVersion !== APP_VERSION;
  return (
    <section aria-labelledby="about-title">
      <h2 id="about-title" className="settings__title">
        About
      </h2>
      <div className="settings__about">
        <AppLogo size={40} />
        <div>
          <p className="settings__about-name" aria-label={APP_NAME}>
            <Wordmark />
          </p>
          <p className="settings__about-tagline">{APP_TAGLINE}</p>
        </div>
      </div>
      <dl className="settings__facts">
        <dt>Server version</dt>
        <dd>{serverVersion ?? (health.isError ? 'Unavailable' : 'Checking…')}</dd>
        <dt>Frontend version</dt>
        <dd>{APP_VERSION}</dd>
      </dl>
      {outdated && (
        <div className="settings__note" role="status">
          <p>
            The server runs version {serverVersion}, but this page was loaded from version{' '}
            {APP_VERSION}. Reload the page to use the current version.
          </p>
          <Button onClick={() => window.location.reload()}>Reload page</Button>
        </div>
      )}
      <p className="settings__note">
        <a href={`${APP_REPOSITORY_URL}#readme`} target="_blank" rel="noopener noreferrer">
          Documentation
        </a>
        {' · '}
        <a href={APP_REPOSITORY_URL} target="_blank" rel="noopener noreferrer">
          GitHub
        </a>
      </p>
    </section>
  );
}
