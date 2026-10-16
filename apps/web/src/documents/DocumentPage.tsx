import { useEffect } from 'react';
import { FileMissingIcon } from '../components/icons';
import { Link, useParams } from 'react-router';
import { ApiError, errorMessage } from '../api/client';
import { useDocument } from '../api/queries';
import { EmptyState, ErrorState, SkeletonLines } from '../components/ui/States';
import { usePageTitle } from '../utils/page-title';
import { rememberLastDocument } from '../app/open-last-document';
import { EditDocument } from './DocumentEditor';
import { ViewDocument } from './ViewDocument';
import './document.css';

/**
 * Document page (UI_SPEC §24–34). `/doc/:id` reads, `/doc/:id/edit` edits the Markdown source in
 * place: same header and layout, only the body changes (no layout jump, §34).
 */
export function DocumentPage({ editing = false }: { editing?: boolean }) {
  const { id = '' } = useParams();
  const document = useDocument(id);

  usePageTitle(document.data?.title);
  const loadedId = document.isSuccess ? document.data.id : undefined;
  useEffect(() => {
    if (loadedId) rememberLastDocument(loadedId);
  }, [loadedId]);

  if (document.isPending) {
    return (
      <article className="doc" aria-busy="true">
        <SkeletonLines count={1} widths={['30%']} />
        <div className="doc__skeleton-title" />
        <SkeletonLines count={5} widths={['92%', '85%', '96%', '60%', '88%']} />
      </article>
    );
  }
  if (document.isError && editing && document.data) {
    return (
      <EditDocument
        key={document.data.id}
        document={document.data}
        missing={document.error instanceof ApiError && document.error.status === 404}
      />
    );
  }
  if (document.isError) {
    if (document.error instanceof ApiError && document.error.status === 404) {
      return (
        <EmptyState
          icon={<FileMissingIcon size={32} />}
          title="Document not found"
          level={1}
          actions={<Link to="/">Back to documentation</Link>}
        >
          It may have been moved, renamed or deleted.
        </EmptyState>
      );
    }
    return (
      <ErrorState
        title="Unable to load document"
        level={1}
        message="The file could not be read."
        details={errorMessage(document.error)}
        onRetry={() => void document.refetch()}
      />
    );
  }
  // A file that is not UTF-8 is never written (the server refuses), so it has no editor.
  return editing && !document.data.notUtf8 ? (
    <EditDocument key={document.data.id} document={document.data} />
  ) : (
    <ViewDocument key={document.data.id} document={document.data} />
  );
}
