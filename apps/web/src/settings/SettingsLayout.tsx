import { useEffect } from 'react';
import { APP_NAME } from '@leandocs/shared';
import { NavLink, Outlet } from 'react-router';
import './settings.css';
import { useSession } from '../auth/Login';

/** Settings sections that exist so far; the rest arrive with their phases (UI_SPEC §81, D-22). */
const SECTIONS = [
  { to: 'storage', label: 'Storage' },
  { to: 'index', label: 'Index' },
  { to: 'links', label: 'Broken links' },
  { to: 'security', label: 'Security' },
  { to: 'about', label: 'About' },
];

/** UI_SPEC §81: left mini-sidebar + main panel. */
export function SettingsLayout() {
  const session = useSession();
  useEffect(() => {
    document.title = `Settings · ${APP_NAME}`;
  }, []);
  return (
    <div className="settings">
      <nav className="settings__nav" aria-label="Settings">
        <h1 className="settings__heading">Settings</h1>
        {SECTIONS.map((section) => (
          <NavLink key={section.to} to={section.to} className="settings__link">
            {section.label}
          </NavLink>
        ))}
      </nav>
      <div className="settings__panel">
        {session.data?.authMode === 'none' && (
          <div className="settings__auth-warning" role="alert">
            <strong>Authentication disabled</strong>
            <p>
              Anyone who can reach this application can read, edit and delete documentation. Enable
              authentication before making it publicly accessible.
            </p>
          </div>
        )}
        <Outlet />
      </div>
    </div>
  );
}
