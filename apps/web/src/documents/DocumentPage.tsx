import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { APP_NAME, type DocumentDto, type TreeFolderNode } from '@leandocs/shared';
import {
  ExpandWidthIcon,
  FileMissingIcon,
  MoreIcon,
  ShrinkWidthIcon,
  WarningIcon,
} from '../components/icons';
import { Link, useNavigate, useParams } from 'react-router';
import { api, ApiError, errorMessage } from '../api/client';
import { useDocument, useTree } from '../api/queries';
import { useContentActions } from '../actions/ContentActions';
import { itemMenuEntries } from '../actions/menu-entries';
import { Button } from '../components/ui/Button';
import { IconButton } from '../components/ui/IconButton';
import { DropdownMenuButton } from '../components/ui/Menu';
import { EmptyState, ErrorState, SkeletonLines } from '../components/ui/States';
import { useNotify } from '../components/ui/Toast';
import { ConflictDialog } from '../editor/ConflictDialog';
import { DraftNotice } from '../editor/DraftNotice';
import { localDraftStore, type Draft } from '../editor/drafts';
import { SaveStatus } from '../editor/SaveStatus';
import { SourceEditor } from '../editor/SourceEditor';
import { useEditorSession } from '../editor/useEditorSession';
import { resolveAttachmentUrl, type LinkTarget } from '../markdown/links';
import { useQueryClient } from '@tanstack/react-query';
import { FileDropSurface } from '../attachments/FileDropSurface';
import { AttachmentPanel, attachmentKey } from '../attachments/AttachmentPanel';
import { HastContent } from '../markdown/MarkdownView';
import { renderMarkdown, type TocHeading } from '../markdown/pipeline';
import { SourceView } from '../markdown/SourceView';
import { useNavigationState } from '../navigation/NavigationContext';
import { folderSegments, formatDate, formatRelativeTime, readingMinutes } from '../utils/format';
import { readPreference, writePreference } from '../utils/storage';
import { useSearchControls } from '../search/SearchContext';
import { ContextSidebar } from './ContextSidebar';
import './document.css';

const VisualEditor = lazy(() =>
  import('../editor/visual/VisualEditor').then((module) => ({ default: module.VisualEditor })),
);

const docUrl = (id: string, edit = false) => `/doc/${encodeURIComponent(id)}${edit ? '/edit' : ''}`;

/**
 * Document page (UI_SPEC §24–34). `/doc/:id` reads, `/doc/:id/edit` edits the Markdown source in
 * place: same header and layout, only the body changes (no layout jump, §34).
 */
export function DocumentPage({ editing = false }: { editing?: boolean }) {
  const { id = '' } = useParams();
  const document = useDocument(id);

  useEffect(() => {
    window.document.title = document.data ? `${document.data.title} — ${APP_NAME}` : APP_NAME;
  }, [document.data]);

  if (document.isPending) {
    return (
      <article className="doc" aria-busy="true">
        <SkeletonLines count={1} widths={['30%']} />
        <div className="doc__skeleton-title" />
        <SkeletonLines count={5} widths={['92%', '85%', '96%', '60%', '88%']} />
      </article>
    );
  }
  if (document.isError) {
    if (document.error instanceof ApiError && document.error.status === 404) {
      return (
        <EmptyState
          icon={<FileMissingIcon size={32} />}
          title="Document not found"
          actions={<Link to="/">Back to documentation</Link>}
        >
          It may have been moved, renamed or deleted.
        </EmptyState>
      );
    }
    return (
      <ErrorState
        title="Unable to load document"
        message="The file could not be read."
        details={errorMessage(document.error)}
        onRetry={() => void document.refetch()}
      />
    );
  }
  return editing ? (
    <EditDocument key={document.data.id} document={document.data} />
  ) : (
    <ViewDocument key={document.data.id} document={document.data} />
  );
}

/** All documents in the tree, for link resolution. */
function collectTargets(root: TreeFolderNode | undefined): LinkTarget[] {
  const result: LinkTarget[] = [];
  const walk = (folder: TreeFolderNode) => {
    for (const child of folder.children) {
      if (child.type === 'document')
        result.push({
          id: child.id,
          title: child.title,
          path: child.path,
          ...(child.aliases ? { aliases: child.aliases } : {}),
        });
      else walk(child);
    }
  };
  if (root) walk(root);
  return result;
}

function useRendered(document: DocumentDto) {
  const tree = useTree();
  return useMemo(
    () =>
      renderMarkdown(document.content, {
        documentPath: document.path,
        title: document.title,
        documents: collectTargets(tree.data),
      }),
    [document.content, document.path, document.title, tree.data],
  );
}

/** Ctrl/Cmd+E toggles View ↔ Edit (PROJECT_SPEC §45). */
function useToggleShortcut(action: () => void) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'e') {
        event.preventDefault();
        action();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [action]);
}

function DocumentLayout({
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
  const { reveal } = useNavigationState();
  const search = useSearchControls();
  // Owner feedback 2026-10-02: use the available width by default; reading width is optional.
  const [wide, setWide] = useState(() => readPreference('layout.wide', true));
  const widthToggle = (
    <IconButton
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
            <div className="doc-editbar__actions">
              {editBar}
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
                  onClick={() => reveal(segments.slice(0, index + 1).join('/'), true)}
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
      <ContextSidebar headings={headings} document={document} editing={Boolean(editBar)} />
    </div>
  );
}

function MoreMenu({ document }: { document: DocumentDto }) {
  const actions = useContentActions();
  const target = {
    kind: 'document' as const,
    id: document.id,
    title: document.title,
    path: document.path,
  };
  return (
    <DropdownMenuButton
      entries={itemMenuEntries(target, actions)}
      trigger={
        <IconButton label="More actions">
          <MoreIcon size={16} />
        </IconButton>
      }
    />
  );
}

type ViewMode = 'view' | 'source';

function ViewDocument({ document }: { document: DocumentDto }) {
  const [mode, setMode] = useState<ViewMode>('view');
  const navigate = useNavigate();
  const rendered = useRendered(document);
  const [draft, setDraft] = useState<Draft | undefined>(() => {
    const stored = localDraftStore.get(document.id);
    return stored && stored.content !== document.content ? stored : undefined;
  });
  const edit = useCallback(() => void navigate(docUrl(document.id, true)), [navigate, document.id]);
  useToggleShortcut(edit);

  // Jump to `#heading` from links like [[Doc#Heading]] once the content is rendered.
  useEffect(() => {
    const hash = decodeURIComponent(window.location.hash.slice(1));
    if (hash) window.document.getElementById(hash)?.scrollIntoView({ block: 'start' });
  }, [rendered]);

  const tabs = (
    <>
      <div className="doc__tabs" role="tablist" aria-label="Document mode">
        {(['view', 'source'] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={mode === value}
            className="doc__tab"
            onClick={() => setMode(value)}
          >
            {value === 'view' ? 'View' : 'Source'}
          </button>
        ))}
        <button type="button" role="tab" aria-selected={false} className="doc__tab" onClick={edit}>
          Edit
        </button>
      </div>
      <MoreMenu document={document} />
    </>
  );

  return (
    <DocumentLayout document={document} headings={rendered.headings} actions={tabs}>
      {draft && (
        <DraftNotice
          draft={draft}
          restoreLabel="Continue editing"
          onRestore={edit}
          onDiscard={() => {
            localDraftStore.remove(document.id);
            setDraft(undefined);
          }}
        />
      )}
      {mode === 'view' ? (
        <div className="doc__body markdown" role="tabpanel">
          {document.content.trim() === '' ? (
            <p className="doc__empty">This document is empty.</p>
          ) : (
            <HastContent tree={rendered.tree} />
          )}
        </div>
      ) : (
        <div role="tabpanel">
          <SourceView source={document.content} />
        </div>
      )}
    </DocumentLayout>
  );
}

function EditDocument({ document }: { document: DocumentDto }) {
  const navigate = useNavigate();
  const notify = useNotify();
  const { session, state } = useEditorSession(document);
  const queryClient = useQueryClient();
  const tree = useTree();
  const [uploadCount, setUploadCount] = useState(0);
  const upload = useCallback(
    async (files: File[]) => {
      setUploadCount((count) => count + 1);
      const links: string[] = [];
      try {
        for (const file of files) {
          try {
            const item = await api.uploadAttachment(document.id, file);
            const label = item.name.replace(/[\\[\]]/g, '\\$&');
            links.push(`${item.image ? '!' : ''}[${label}](${item.markdownUrl})`);
          } catch (error) {
            notify.error(`Upload failed: ${errorMessage(error)}`);
          }
        }
        await queryClient.invalidateQueries({ queryKey: attachmentKey(document.id) });
        return links.join('\n\n');
      } finally {
        setUploadCount((count) => count - 1);
      }
    },
    [document.id, notify, queryClient],
  );
  const linkTargets = useMemo(() => collectTargets(tree.data), [tree.data]);
  const resolveUrl = (url: string) =>
    resolveAttachmentUrl(url, {
      documentPath: document.path,
      documents: [
        { id: document.id, title: document.title, path: document.path },
        ...collectTargets(tree.data),
      ],
    });
  const [editorMode, setEditorMode] = useState<'visual' | 'source'>(() =>
    readPreference<string>('editor.mode', 'visual') === 'source' ? 'source' : 'visual',
  );
  const rendered = useRendered(document);
  // The conflict dialog opens by itself on a new conflict; "Cancel" dismisses it for that revision.
  const [conflictRequested, setConflictRequested] = useState(false);
  const [dismissedConflict, setDismissedConflict] = useState<string | null>(null);
  const conflictOpen =
    state.status === 'conflict' &&
    (conflictRequested || dismissedConflict !== (state.conflictRevision ?? ''));
  const [draft, setDraft] = useState<Draft | undefined>(() => {
    const stored = localDraftStore.get(document.id);
    return stored && stored.content !== document.content ? stored : undefined;
  });
  const [showLineNumbers] = useState(() =>
    readPreference('editor.lineNumbers', !window.matchMedia?.('(max-width: 767px)').matches),
  );

  /** "Done" / Esc / Ctrl+E: save first, then return to the view; stay if the save fails. */
  const done = useCallback(async () => {
    if (uploadCount) {
      notify.info('Wait for attachments to finish uploading.');
      return;
    }
    await session.saveNow();
    const { status, error } = session.getState();
    if (status === 'conflict') setConflictRequested(true);
    else if (status === 'error') notify.error(`Not saved: ${error ?? 'unknown error'}`);
    else void navigate(docUrl(document.id));
  }, [session, navigate, notify, document.id, uploadCount]);
  const doneSync = useCallback(() => void done(), [done]);
  useToggleShortcut(doneSync);

  const actions = (
    <div className="doc-edit-actions">
      <div className="doc__tabs" role="tablist" aria-label="Editor mode">
        {(['visual', 'source'] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            role="tab"
            aria-selected={editorMode === mode}
            disabled={uploadCount > 0}
            className="doc__tab"
            onClick={() => {
              setEditorMode(mode);
              writePreference('editor.mode', mode);
            }}
          >
            {mode === 'visual' ? 'Visual' : 'Source'}
          </button>
        ))}
      </div>
      <SaveStatus
        state={state}
        onRetry={() => void session.saveNow()}
        onResolveConflict={() => setConflictRequested(true)}
      />
      <Button
        size="small"
        onClick={() => void session.saveNow()}
        disabled={state.status === 'saving'}
      >
        Save
      </Button>
      <Button size="small" variant="primary" onClick={doneSync}>
        Done
      </Button>
      <MoreMenu document={document} />
    </div>
  );

  return (
    <DocumentLayout document={document} headings={rendered.headings} editBar={actions}>
      {draft && (
        <DraftNotice
          draft={draft}
          onRestore={() => {
            session.restoreDraft(draft);
            setDraft(undefined);
          }}
          onDiscard={() => {
            session.discardDraft();
            setDraft(undefined);
          }}
        />
      )}
      <FileDropSurface>
        {editorMode === 'visual' ? (
          <Suspense fallback={<p role="status">Loading editor…</p>}>
            <VisualEditor
              key={state.externalVersion}
              initialValue={state.content}
              onChange={(value) => session.setContent(value)}
              onSave={() => void session.saveNow()}
              onExit={doneSync}
              onSource={() => !uploadCount && setEditorMode('source')}
              onUpload={upload}
              resolveUrl={resolveUrl}
              linkTargets={linkTargets}
              documentId={document.id}
            />
          </Suspense>
        ) : (
          <SourceEditor
            key={state.externalVersion}
            initialValue={state.content}
            onChange={(value) => session.setContent(value)}
            onSave={() => void session.saveNow()}
            onExit={doneSync}
            lineNumbers={showLineNumbers}
            onUpload={upload}
            linkTargets={linkTargets}
            documentId={document.id}
          />
        )}
      </FileDropSurface>
      {uploadCount > 0 && (
        <p className="upload-status" role="status">
          Uploading attachments… You can keep writing.
        </p>
      )}
      {conflictOpen && (
        <ConflictDialog
          document={document}
          session={session}
          state={state}
          onClose={() => {
            setConflictRequested(false);
            setDismissedConflict(state.conflictRevision ?? '');
          }}
        />
      )}
    </DocumentLayout>
  );
}
