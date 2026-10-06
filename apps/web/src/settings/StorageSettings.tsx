import { errorMessage } from '../api/client';
import { useIndexStatus } from '../api/queries';
import { ErrorState, SkeletonLines } from '../components/ui/States';
import { formatBytes } from '../utils/format';
import { RebuildIndex } from './RebuildIndex';

/** UI_SPEC §86: where the data lives and how much space it takes. */
export function StorageSettings() {
  const status = useIndexStatus();
  if (status.isError)
    return (
      <ErrorState
        title="Storage information is unavailable"
        message={errorMessage(status.error)}
        onRetry={() => void status.refetch()}
      />
    );
  if (!status.data) return <SkeletonLines count={5} />;
  const { storage, documents, rebuild } = status.data;
  return (
    <section aria-labelledby="storage-title">
      <h2 id="storage-title" className="settings__title">
        Storage
      </h2>
      <dl className="settings__facts">
        <dt>Data directory</dt>
        <dd>
          <code>{storage.dataDir}</code>
        </dd>
        <dt>Content directory</dt>
        <dd>
          <code>{storage.contentDir}</code>
        </dd>
        <dt>Documents</dt>
        <dd>{documents.toLocaleString('en')}</dd>
        <dt>Attachments size</dt>
        <dd>{formatBytes(storage.attachmentsBytes)}</dd>
        <dt>Database size</dt>
        <dd>{formatBytes(storage.databaseBytes)}</dd>
      </dl>
      <p className="settings__note">
        Your documents are the Markdown files in the content directory. The database only holds the
        search index and app settings, and can be rebuilt from the files at any time.
      </p>
      <RebuildIndex rebuild={rebuild} />
    </section>
  );
}
