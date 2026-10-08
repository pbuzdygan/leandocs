import { NavLink, Outlet, useLocation } from 'react-router';
import { usePageTitle } from '../utils/page-title';
import './settings.css';
import { useSession } from '../auth/Login';

/** UI_SPEC §81 order. */
const SECTIONS = [
  { to: 'general', label: 'General' },
  { to: 'editor', label: 'Editor' },
  { to: 'appearance', label: 'Appearance' },
  { to: 'security', label: 'Security' },
  { to: 'storage', label: 'Storage' },
  { to: 'index', label: 'Index' },
  { to: 'links', label: 'Broken links' },
  { to: 'about', label: 'About' },
];

/** UI_SPEC §81: left mini-sidebar + main panel. */
export function SettingsLayout() {
  const session = useSession();
  const { pathname } = useLocation();
  const section = SECTIONS.find((item) => pathname.endsWith(`/${item.to}`));
  usePageTitle(section ? `${section.label} · Settings` : 'Settings');
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
