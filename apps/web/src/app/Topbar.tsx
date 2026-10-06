import { APP_NAME } from '@leandocs/shared';
import { UserMenu } from '../auth/Login';
import { AddIcon, MenuIcon, SearchIcon, SettingsIcon } from '../components/icons';
import { Link, useMatch, useNavigate } from 'react-router';
import { useTree } from '../api/queries';
import { useContentActions } from '../actions/ContentActions';
import { AppLogo, Wordmark } from '../components/AppLogo';
import { Button } from '../components/ui/Button';
import '../search/search.css';
import { IconButton } from '../components/ui/IconButton';
import { useNavigationState } from '../navigation/NavigationContext';
import { findDocument } from '../navigation/tree-utils';
import { modifierLabel, useSearchControls } from '../search/SearchContext';
import { parentPath } from '../utils/format';

/**
 * UI_SPEC §15: 52 px, always visible. Logo left, search centre (§16), New + Settings right.
 * The user menu arrives with authentication (Phase 11) — no non-functional placeholders.
 */
export function Topbar() {
  const actions = useContentActions();
  const search = useSearchControls();
  const navigate = useNavigate();
  const { drawerOpen, setDrawerOpen } = useNavigationState();
  const tree = useTree();
  const match = useMatch('/doc/:id/*');
  const openDocument =
    match?.params.id && tree.data ? findDocument(tree.data, match.params.id) : undefined;

  return (
    <header className="topbar">
      <IconButton
        label={drawerOpen ? 'Close navigation' : 'Open navigation'}
        className="topbar__menu"
        onClick={() => setDrawerOpen(!drawerOpen)}
        aria-expanded={drawerOpen}
      >
        <MenuIcon size={18} />
      </IconButton>
      <Link to="/" className="topbar__brand" aria-label={`${APP_NAME} home`}>
        <AppLogo />
        <Wordmark />
      </Link>
      <div className="topbar__spacer" />
      <button type="button" className="topbar-search" onClick={() => search.openSearch()}>
        <SearchIcon size={15} aria-hidden="true" />
        <span className="topbar-search__label">Search documentation…</span>
        <kbd className="topbar-search__kbd">{modifierLabel()} K</kbd>
      </button>
      <div className="topbar__spacer" />
      <IconButton label="Search" className="topbar-search-icon" onClick={() => search.openSearch()}>
        <SearchIcon size={18} />
      </IconButton>
      <Button
        variant="primary"
        size="small"
        onClick={() => actions.newDocument(openDocument ? parentPath(openDocument.path) : '')}
      >
        <AddIcon size={15} />
        New
      </Button>
      <IconButton label="Settings" onClick={() => navigate('/settings')}>
        <SettingsIcon size={18} />
      </IconButton>
      <UserMenu />
    </header>
  );
}
