import type { OutgoingLink } from '@leandocs/shared';
import { Link } from 'react-router';
import { useDocumentLinks } from '../api/queries';
import { displayFolder, parentPath } from '../utils/format';

function describeBroken(link: OutgoingLink): string {
  return link.kind === 'wiki' ? `[[${link.raw}]]` : link.raw;
}

/** "Links" tab (UI_SPEC §47): Referenced by (backlinks) and Links to (outgoing). */
export function LinksPanel({ documentId }: { documentId: string }) {
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
          <p className="context__empty">Loading…</p>
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
          <p className="context__empty">Loading…</p>
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
    </div>
  );
}
