import type { ScanIssueCode } from '@leandocs/shared';
import { errorMessage } from '../api/client';
import { useIndexStatus } from '../api/queries';
import { ErrorState, SkeletonLines } from '../components/ui/States';
import { formatDate, formatRelativeTime } from '../utils/format';
import { RebuildIndex } from './RebuildIndex';

const ISSUE_LABELS: Record<ScanIssueCode, string> = {
  FRONTMATTER_INVALID: 'Invalid front matter',
  INVALID_ID: 'Invalid id',
  DUPLICATE_ID: 'Duplicate id',
  ID_ASSIGNMENT_FAILED: 'Could not add an id',
  UNREADABLE: 'Unreadable file',
  TOO_COMPLEX: 'Read as plain text',
};

/** Search index status, problems found in the files, and the rebuild action. */
export function IndexSettings() {
  const status = useIndexStatus();
  if (status.isError)
    return (
      <ErrorState
        title="Index status is unavailable"
        message={errorMessage(status.error)}
        onRetry={() => void status.refetch()}
      />
    );
  if (!status.data) return <SkeletonLines count={5} />;
  const { documents, folders, tags, issues, rebuild } = status.data;
  return (
    <section aria-labelledby="index-title">
      <h2 id="index-title" className="settings__title">
        Index
      </h2>
      <dl className="settings__facts">
        <dt>Indexed documents</dt>
        <dd>{documents.toLocaleString('en')}</dd>
        <dt>Folders</dt>
        <dd>{folders.toLocaleString('en')}</dd>
        <dt>Tags</dt>
        <dd>{tags.toLocaleString('en')}</dd>
        <dt>Last full rebuild</dt>
        <dd>
          {rebuild.lastRebuildAt ? (
            <time dateTime={rebuild.lastRebuildAt} title={formatDate(rebuild.lastRebuildAt)}>
              {formatRelativeTime(rebuild.lastRebuildAt)}
            </time>
          ) : (
            'Never (the index is kept up to date automatically)'
          )}
        </dd>
      </dl>
      <RebuildIndex rebuild={rebuild} />

      <h3 className="settings__subtitle">Problems in files</h3>
      {issues.length === 0 ? (
        <p className="settings__note">No problems found.</p>
      ) : (
        <ul className="settings__issues">
          {issues.map((issue, index) => (
            <li key={`${issue.path}-${index}`}>
              <strong>{ISSUE_LABELS[issue.code] ?? issue.code}</strong> · <code>{issue.path}</code>
              <div className="settings__issue-message">{issue.message}</div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
