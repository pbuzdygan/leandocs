import { useState, type ReactNode } from 'react';
import type { DocumentDto } from '@leandocs/shared';
import {
  ContextPanelIcon,
  ExpandWidthIcon,
  ShrinkWidthIcon,
  WarningIcon,
} from '../components/icons';
import { IconButton } from '../components/ui/IconButton';
import { AttachmentPanel } from '../attachments/AttachmentPanel';
import type { TocHeading } from '../markdown/pipeline';
import { useNavigationState } from '../navigation/NavigationContext';
import { useSearchControls } from '../search/SearchContext';
import { folderSegments, formatDate, formatRelativeTime, readingMinutes } from '../utils/format';
import { MEDIA, useMediaQuery } from '../utils/media';
import { readPreference, writePreference } from '../utils/storage';
import { ContextDrawer, ContextSidebar } from './ContextSidebar';
import './document.css';

export function DocumentLayout({
  document,
  headings,
  actions,
  editBar,
  children,
}: {
  document: DocumentDto;
  headings: TocHeading[];
  actions?: ReactNode;
  /** Editing controls kept visible while scrolling (owner feedback, UI_SPEC §150). */
  editBar?: ReactNode;
  children: ReactNode;
}) {
  const { showFolder } = useNavigationState();
  const search = useSearchControls();
  // Owner feedback 2026-10-02: use the available width by default; reading width is optional.
  const [wide, setWide] = useState(() => readPreference('layout.wide', true));
  // Phones always use the full width (the toggle is hidden by CSS there).
  const widthToggle = (
    <IconButton
      className="doc__width-toggle"
      label={wide ? 'Use reading width' : 'Use full width'}
      aria-pressed={wide}
      onClick={() => {
        setWide(!wide);
        writePreference('layout.wide', !wide);
      }}
    >
      {wide ? <ShrinkWidthIcon size={16} /> : <ExpandWidthIcon size={16} />}
    </IconButton>
  );
  // UI_SPEC §99–101: the context panel sits beside the document only where there is room.
  const contextInline = useMediaQuery(MEDIA.contextInline);
  const [contextOpen, setContextOpen] = useState(false);
  if (contextInline && contextOpen) setContextOpen(false);
  const contextButton = contextInline ? null : (
    <IconButton
      label="Contents, links and info"
      aria-haspopup="dialog"
      onClick={() => setContextOpen(true)}
    >
      <ContextPanelIcon size={16} />
    </IconButton>
  );
  const segments = folderSegments(document.path);
  const description =
    typeof document.frontmatter.description === 'string' ? document.frontmatter.description : null;
  const tags = Array.isArray(document.frontmatter.tags)
    ? document.frontmatter.tags.filter((tag): tag is string => typeof tag === 'string')
    : [];

  return (
    <div className="doc-layout">
      <article
        className={['doc', editBar && 'doc--editing', wide && 'doc--wide']
          .filter(Boolean)
          .join(' ')}
      >
        {editBar && (
          <div className="doc-editbar" role="region" aria-label="Editing">
            <span className="doc-editbar__title">{document.title}</span>
            <div className="doc-editbar__actions">{editBar}</div>
            <div className="doc-editbar__layout">
              {contextButton}
              {widthToggle}
            </div>
          </div>
        )}
        {segments.length > 0 && (
          <nav className="doc__breadcrumb" aria-label="Breadcrumb">
            {segments.map((segment, index) => (
              <span key={index}>
                <button
                  type="button"
                  className="doc__crumb"
                  onClick={() => showFolder(segments.slice(0, index + 1).join('/'))}
                >
                  {segment}
                </button>
                <span className="doc__crumb-separator" aria-hidden="true">
                  /
                </span>
              </span>
            ))}
            <span aria-current="page">{document.title}</span>
          </nav>
        )}

        <header className="doc__header">
          <div className="doc__heading">
            <h1 className="doc__title">{document.title}</h1>
            {actions && (
              <div className="doc__actions">
                {actions}
                {contextButton}
                {widthToggle}
              </div>
            )}
          </div>
          {description && <p className="doc__description">{description}</p>}
          {tags.length > 0 && (
            <ul className="doc__tags" aria-label="Tags">
              {tags.map((tag) => (
                <li key={tag}>
                  {/* P10-03: a tag filters the documentation (search `tag:`). */}
                  <button
                    type="button"
                    className="tag tag--button"
                    title={`Show documents tagged ${tag}`}
                    onClick={() =>
                      search.openSearch(`tag:${tag.includes(' ') ? `"${tag}"` : tag} `)
                    }
                  >
                    {tag}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="doc__meta">
            {document.updated && (
              <time dateTime={document.updated} title={formatDate(document.updated)}>
                Updated {formatRelativeTime(document.updated)}
              </time>
            )}
            {document.updated && ' · '}
            {readingMinutes(document.content)} min read
          </p>
          {document.analysisLimited && (
            <p className="doc__warning" role="note">
              <WarningIcon size={14} aria-hidden="true" />
              This document is {document.analysisLimited}, so it is shown as plain text and can only
              be edited as Markdown source. Links and headings in it are not indexed.
            </p>
          )}
          {document.notUtf8 && (
            <p className="doc__warning" role="note">
              <WarningIcon size={14} aria-hidden="true" />
              This file is not saved as UTF-8 text, so some characters may look wrong and it cannot
              be edited here. LeanDocs never changes it; convert it to UTF-8 in another editor to
              edit it.
            </p>
          )}
          {document.frontmatterError && (
            <p className="doc__warning" role="note">
              <WarningIcon size={14} aria-hidden="true" />
              The document header (front matter) could not be read. It is kept unchanged; fix it in
              the file.
            </p>
          )}
        </header>
        {children}
        <AttachmentPanel id={document.id} />
      </article>
      {contextInline ? (
        <ContextSidebar headings={headings} document={document} editing={Boolean(editBar)} />
      ) : (
        <ContextDrawer
          open={contextOpen}
          onOpenChange={setContextOpen}
          headings={headings}
          document={document}
          editing={Boolean(editBar)}
        />
      )}
    </div>
  );
}
