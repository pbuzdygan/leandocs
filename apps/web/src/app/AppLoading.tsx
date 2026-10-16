import { AppLogo } from '../components/AppLogo';
import '../auth/setup.css';

/**
 * Initial app loading (UI_SPEC §78): the small mark and one line, no splash animation. Shown while
 * the setup and session checks run, before the shell can render.
 */
export function AppLoading() {
  return (
    <main className="setup" aria-busy="true">
      <div className="app-loading" role="status">
        <AppLogo size={32} />
        <p>Loading documentation…</p>
      </div>
    </main>
  );
}
