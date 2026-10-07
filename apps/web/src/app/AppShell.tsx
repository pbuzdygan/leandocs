import { Outlet } from 'react-router';
import { NavigationSidebar } from '../navigation/NavigationSidebar';
import { Topbar } from './Topbar';
import './AppShell.css';
import { ContentActionsProvider } from '../actions/ContentActions';
import { NavigationProvider } from '../navigation/NavigationContext';
import { SearchProvider } from '../search/SearchContext';
import { useExternalChanges } from '../api/external-changes';

/** UI_SPEC §14: Topbar + Navigation + Document. The context sidebar arrives with the TOC (P4-04). */
export function AppShell() {
  useExternalChanges();
  return (
    <NavigationProvider>
      <ContentActionsProvider>
        <SearchProvider>
          <div className="app-shell">
            <Topbar />
            <div className="app-shell__body">
              <NavigationSidebar />
              <main className="workspace" id="main">
                <Outlet />
              </main>
            </div>
          </div>
        </SearchProvider>
      </ContentActionsProvider>
    </NavigationProvider>
  );
}
