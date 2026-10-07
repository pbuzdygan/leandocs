import { useEffect } from 'react';
import { APP_NAME } from '@leandocs/shared';
import { FileIcon, ImportIcon, NewFileIcon, NewFolderIcon, SearchIcon } from '../components/icons';
import { Link } from 'react-router';
import { errorMessage } from '../api/client';
import { usePins, useRecentDocuments, useTree } from '../api/queries';
import { useSearchControls } from '../search/SearchContext';
import { useContentActions } from '../actions/ContentActions';
import { Button } from '../components/ui/Button';
import { EmptyState, ErrorState, SkeletonLines } from '../components/ui/States';
import { displayFolder, folderSegments, formatRelativeTime } from '../utils/format';
import './home.css';

/** UI_SPEC §91–93: a simple start page with lists, not a dashboard. */
export function Home() {
  const tree = useTree();
  const recent = useRecentDocuments();
  const actions = useContentActions();
  const pins = usePins();
  const search = useSearchControls();

  useEffect(() => {
    document.title = APP_NAME;
  }, []);

  if (tree.data && tree.data.children.length === 0) {
    return (
      <EmptyState
        icon={<FileIcon size={32} />}
        title="No documentation yet"
        actions={
          <>
            <Button variant="primary" onClick={() => actions.newDocument('')}>
              New document
            </Button>
            <button
              type="button"
              className="link-button"
              onClick={() => actions.importDocuments('')}
            >
              Import Markdown
            </button>
          </>
        }
      >
        Create your first document or import an existing Markdown directory.
      </EmptyState>
    );
  }

  return (
    <div className="home">
      <h1 className="home__title">Documentation</h1>

      <section className="home__section" aria-labelledby="quick-actions">
        <h2 id="quick-actions" className="home__heading">
          Quick actions
        </h2>
        <div className="home__actions">
          <Button onClick={() => actions.newDocument('')}>
            <NewFileIcon size={15} /> New document
          </Button>
          <Button onClick={() => actions.newFolder('')}>
            <NewFolderIcon size={15} /> New folder
          </Button>
          <Button onClick={() => search.openSearch()}>
            <SearchIcon size={15} /> Search
          </Button>
          <Button onClick={() => actions.importDocuments('')}>
            <ImportIcon size={15} /> Import
          </Button>
        </div>
      </section>

      {pins.data && pins.data.items.length > 0 && (
        <section className="home__section" aria-labelledby="pinned-documents">
          <h2 id="pinned-documents" className="home__heading">
            Pinned
          </h2>
          <ul className="home__list">
            {pins.data.items.map((item) => (
              <li key={item.id}>
                <Link to={`/doc/${encodeURIComponent(item.id)}`} className="home__item">
                  <span className="home__item-title">{item.title}</span>
                  <span className="home__item-meta">
                    {displayFolder(folderSegments(item.path).join('/'))}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="home__section" aria-labelledby="recent-documents">
        <h2 id="recent-documents" className="home__heading">
          Recently updated
        </h2>
        {recent.isPending && <SkeletonLines count={4} widths={['40%', '55%', '35%', '50%']} />}
        {recent.isError && (
          <ErrorState
            title="Unable to load recent documents"
            message={errorMessage(recent.error)}
            onRetry={() => void recent.refetch()}
          />
        )}
        {recent.data && (
          <ul className="home__list">
            {recent.data.items.map((item) => (
              <li key={item.id}>
                <Link to={`/doc/${encodeURIComponent(item.id)}`} className="home__item">
                  <span className="home__item-title">{item.title}</span>
                  <span className="home__item-meta">
                    {displayFolder(folderSegments(item.path).join('/'))} · Updated{' '}
                    {formatRelativeTime(item.modified)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
