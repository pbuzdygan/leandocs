import type { OutgoingLink } from '@leandocs/shared';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { api } from '../api/client';
import { useDocumentLinks } from '../api/queries';
import { attachmentKey } from '../attachments/AttachmentPanel';
import { describeUses, missingAttachments } from '../attachments/missing';
import { useNotify } from '../components/ui/Toast';
import { LoadingLines } from '../components/ui/States';
import { attachmentRefKey } from '../markdown/MarkdownView';
import type { AttachmentRef } from '../markdown/pipeline';
import { displayFolder, parentPath } from '../utils/format';

function describeBroken(link: OutgoingLink): string {
  return link.kind === 'wiki' ? `[[${link.raw}]]` : link.raw;
}

interface LinksPanelProps {
  documentId: string;
  attachmentRefs: readonly AttachmentRef[];
  editing: boolean;
  /** After a place in the text was scrolled into view (the drawer closes and focuses it). */
  onNavigate?: (target: HTMLElement) => void;
}

/**
 * "Links" tab (UI_SPEC §47): Referenced by (backlinks), Links to (outgoing) and, when the document
 * links to its own attachments, the files among them that no longer exist.
 */
export function LinksPanel({ documentId, attachmentRefs, editing, onNavigate }: LinksPanelProps) {
  const { outgoing, backlinks } = useDocumentLinks(documentId);
  return (
    <div className="links-panel">
      <section aria-labelledby="backlinks-title">
        <h3 id="backlinks-title" className="links-panel__heading">
          Referenced by
        </h3>
        {backlinks.isError ? (
          <p className="context__empty">Backlinks are unavailable.</p>
        ) : !backlinks.data ? (
          <LoadingLines label="Loading backlinks…" count={2} />
        ) : backlinks.data.items.length === 0 ? (
          <p className="context__empty">No documents link here yet.</p>
        ) : (
          <ul className="links-panel__list">
            {backlinks.data.items.map((item) => (
              <li key={item.id}>
                <Link to={`/doc/${encodeURIComponent(item.id)}`} className="links-panel__link">
                  {item.title}
                </Link>
                <span className="links-panel__meta">
                  {displayFolder(parentPath(item.path))}
                  {item.count > 1 ? ` · ${item.count} links` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-labelledby="outgoing-title">
        <h3 id="outgoing-title" className="links-panel__heading">
          Links to
        </h3>
        {outgoing.isError ? (
          <p className="context__empty">Links are unavailable.</p>
        ) : !outgoing.data ? (
          <LoadingLines label="Loading links…" count={2} />
        ) : outgoing.data.items.length === 0 ? (
          <p className="context__empty">This document has no links to other documents.</p>
        ) : (
          <ul className="links-panel__list">
            {outgoing.data.items.map((item, index) =>
              item.target ? (
                <li key={item.target.id}>
                  <Link
                    to={`/doc/${encodeURIComponent(item.target.id)}`}
                    className="links-panel__link"
                  >
                    {item.target.title}
                  </Link>
                  <span className="links-panel__meta">
                    {displayFolder(parentPath(item.target.path))}
                  </span>
                </li>
              ) : (
                <li key={`broken-${index}`}>
                  <span className="broken-link" title="Document not found">
                    {describeBroken(item)}
                  </span>
                  <span className="links-panel__meta">Not found</span>
                </li>
              ),
            )}
          </ul>
        )}
      </section>
      <MissingFiles
        documentId={documentId}
        refs={attachmentRefs}
        editing={editing}
        onNavigate={onNavigate}
      />
    </div>
  );
}

/** How long a place in the text stays highlighted after choosing it. */
const HIGHLIGHT_MS = 2000;

function MissingFiles({
  documentId,
  refs,
  editing,
  onNavigate,
}: {
  documentId: string;
  refs: readonly AttachmentRef[];
  editing: boolean;
  onNavigate?: (target: HTMLElement) => void;
}) {
  const notify = useNotify();
  const linksOwnFiles = refs.some((ref) => ref.documentId === documentId);
  // Same query as the Attachments list below the document, so deleting a file updates both.
  const attachments = useQuery({
    queryKey: attachmentKey(documentId),
    queryFn: () => api.attachments(documentId),
    enabled: linksOwnFiles,
  });
  if (!linksOwnFiles) return null;

  const show = (name: string) => {
    const key = attachmentRefKey(documentId, name);
    const target = [...document.querySelectorAll<HTMLElement>('.doc__body [data-attachment]')].find(
      (element) => element.dataset.attachment === key,
    );
    if (!target) {
      // The Source tab shows Markdown, not the rendered links.
      notify.info('Switch to View to see where this file is linked.');
      return;
    }
    target.scrollIntoView({ block: 'center' });
    target.classList.add('attachment-highlight');
    window.setTimeout(() => target.classList.remove('attachment-highlight'), HIGHLIGHT_MS);
    if (onNavigate) onNavigate(target);
    else {
      // Images and "Image not found" placeholders are not focusable on their own.
      if (target.tabIndex < 0 && !target.hasAttribute('tabindex'))
        target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
    }
  };

  const missing = attachments.data
    ? missingAttachments(
        refs,
        documentId,
        attachments.data.items.map((item) => item.name),
      )
    : [];
  return (
    <section aria-labelledby="missing-files-title">
      <h3 id="missing-files-title" className="links-panel__heading">
        Missing files
      </h3>
      {attachments.isError ? (
        <p className="context__empty">Attached files could not be checked.</p>
      ) : !attachments.data ? (
        <LoadingLines label="Checking attached files…" count={1} />
      ) : missing.length === 0 ? (
        <p className="context__empty">All linked files are attached.</p>
      ) : (
        <ul className="links-panel__list">
          {missing.map((item) => (
            <li key={item.name}>
              {/* While editing, the text is in the editor, so there is no place to jump to. */}
              {editing ? (
                <span className="broken-link" title="File not found">
                  {item.name}
                </span>
              ) : (
                <button
                  type="button"
                  className="link-button links-panel__missing broken-link"
                  title="Show where it is linked"
                  onClick={() => show(item.name)}
                >
                  {item.name}
                </button>
              )}
              <span className="links-panel__meta">Not found · {describeUses(item)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
