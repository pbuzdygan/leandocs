import { APP_NAME } from '@leandocs/shared';
import { UserMenu } from '../auth/Login';
import {
  AddIcon,
  BackIcon,
  ForwardIcon,
  MenuIcon,
  SearchIcon,
  SettingsIcon,
} from '../components/icons';
import { Link, useMatch, useNavigate } from 'react-router';
import { useTree } from '../api/queries';
import { useContentActions } from '../actions/ContentActions';
import { AppLogo, Wordmark } from '../components/AppLogo';
import { Button } from '../components/ui/Button';
import '../search/search.css';
import { IconButton } from '../components/ui/IconButton';
import { NAVIGATION_DRAWER_ID, useNavigationState } from '../navigation/NavigationContext';
import { findDocument } from '../navigation/tree-utils';
import { modifierLabel, useSearchControls } from '../search/SearchContext';
import { parentPath } from '../utils/format';
import { MEDIA, useMediaQuery } from '../utils/media';
import { useHistoryPosition } from './history';

/**
 * UI_SPEC §15: 52 px, always visible. Logo and ← → (§94) left, search centre (§16), New,
 * Settings and the user menu right.
 */
export function Topbar() {
  const actions = useContentActions();
  const search = useSearchControls();
  const navigate = useNavigate();
  const { drawerOpen, setDrawerOpen, sidebarHidden, setSidebarHidden } = useNavigationState();
  const mobile = useMediaQuery(MEDIA.mobile);
  const tree = useTree();
  const history = useHistoryPosition();
  const match = useMatch('/doc/:id/*');
  const openDocument =
    match?.params.id && tree.data ? findDocument(tree.data, match.params.id) : undefined;

  return (
    <header className="topbar">
      {/* Phones: opens the navigation drawer. Wider screens: hides or shows the sidebar. */}
      <IconButton
        label={
          mobile
            ? drawerOpen
              ? 'Close navigation'
              : 'Open navigation'
            : sidebarHidden
              ? 'Show navigation'
              : 'Hide navigation'
        }
        className="topbar__menu"
        onClick={() => (mobile ? setDrawerOpen(!drawerOpen) : setSidebarHidden(!sidebarHidden))}
        aria-expanded={mobile ? drawerOpen : !sidebarHidden}
        aria-controls={NAVIGATION_DRAWER_ID}
      >
        <MenuIcon size={18} />
      </IconButton>
      <Link to="/" className="topbar__brand" aria-label={`${APP_NAME} home`}>
        <AppLogo />
        <Wordmark />
      </Link>
      {/* The browser's own history, so these agree with its Back button and Alt+← / Alt+→. */}
      <div className="topbar__history">
        <IconButton label="Back" disabled={!history.canGoBack} onClick={() => void navigate(-1)}>
          <BackIcon size={18} />
        </IconButton>
        <IconButton
          label="Forward"
          disabled={!history.canGoForward}
          onClick={() => void navigate(1)}
        >
          <ForwardIcon size={18} />
        </IconButton>
      </div>
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
        onClick={() =>
          actions.newDocument(openDocument ? parentPath(openDocument.path) : undefined)
        }
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
