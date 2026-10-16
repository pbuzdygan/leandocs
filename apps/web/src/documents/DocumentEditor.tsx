import { lazy, Suspense, useCallback, useMemo, useState } from 'react';
import {
  DEFAULT_SETTINGS,
  type AppSettings,
  type DocumentDto,
  type EditorMode,
} from '@leandocs/shared';
import { useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '../api/client';
import { useSettings, useTree } from '../api/queries';
import { Button } from '../components/ui/Button';
import { LoadingLines } from '../components/ui/States';
import { useNotify } from '../components/ui/Toast';
import { ConflictDialog } from '../editor/ConflictDialog';
import { DraftNotice } from '../editor/DraftNotice';
import { localDraftStore, type Draft } from '../editor/drafts';
import { SaveStatus } from '../editor/SaveStatus';
import { SourceEditor } from '../editor/SourceEditor';
import { useEditorSession } from '../editor/useEditorSession';
import { resolveAttachmentUrl } from '../markdown/links';
import { FileDropSurface } from '../attachments/FileDropSurface';
import { attachmentKey } from '../attachments/AttachmentPanel';
import { Tab, TabPanel, Tabs, TabsList } from '../components/ui/Tabs';
import { DocumentLayout } from './DocumentLayout';
import { collectTargets, docUrl, MoreMenu, useRendered, useToggleShortcut } from './document-utils';

const VisualEditor = lazy(() =>
  import('../editor/visual/VisualEditor').then((module) => ({ default: module.VisualEditor })),
);

/** The editor starts from the settings (mode, autosave), so it waits for them; usually cached. */
export function EditDocument(props: { document: DocumentDto; missing?: boolean }) {
  const settings = useSettings();
  if (settings.isPending)
    return (
      <article className="doc">
        <LoadingLines label="Loading editor…" />
      </article>
    );
  // Editing must not depend on the settings: fall back to the defaults when they fail to load.
  return <DocumentEditor {...props} settings={settings.data ?? DEFAULT_SETTINGS} />;
}

function DocumentEditor({
  document,
  missing = false,
  settings,
}: {
  document: DocumentDto;
  missing?: boolean;
  settings: AppSettings;
}) {
  const navigate = useNavigate();
  const notify = useNotify();
  const { session, state } = useEditorSession(document, localDraftStore, missing, {
    enabled: settings.general.autosave,
    delay: settings.editor.autosaveDelay,
  });
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
            notify.error(
              `Could not upload ${file.name} (${errorMessage(error)}). Check the file type and size, then upload it again.`,
            );
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
  // Starts in the default editor; switching applies to this editing session only.
  const [preferredMode, setEditorMode] = useState<EditorMode>(settings.editor.defaultMode);
  // The visual editor parses the whole document: not for documents read as plain text.
  const editorMode = document.analysisLimited ? 'source' : preferredMode;
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

  /** "Done" / Esc / Ctrl+E: save first, then return to the view; stay if the save fails. */
  const done = useCallback(async () => {
    if (uploadCount) {
      notify.info('Wait for attachments to finish uploading.');
      return;
    }
    await session.saveNow();
    const { status, error } = session.getState();
    if (status === 'conflict') setConflictRequested(true);
    // Say what failed and what to do; the changes are still in the editor and this browser.
    else if (status === 'error')
      notify.error(
        `The document was not saved (${error ?? 'unknown error'}). Your changes are kept here; try Save again.`,
      );
    else void navigate(docUrl(document.id));
  }, [session, navigate, notify, document.id, uploadCount]);
  const doneSync = useCallback(() => void done(), [done]);
  useToggleShortcut(doneSync);

  const actions = (
    <div className="doc-edit-actions">
      <div className="doc-edit-actions__group">
        <TabsList label="Editor mode">
          {(['visual', 'source'] as const).map((mode) => (
            <Tab
              key={mode}
              value={mode}
              disabled={uploadCount > 0 || (mode === 'visual' && Boolean(document.analysisLimited))}
            >
              {mode === 'visual' ? 'Visual' : 'Source'}
            </Tab>
          ))}
        </TabsList>
        <SaveStatus
          state={state}
          onRetry={() => void session.saveNow()}
          onResolveConflict={() => setConflictRequested(true)}
        />
      </div>
      <div className="doc-edit-actions__group">
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
    </div>
  );

  return (
    // Manual activation: arrowing across the tabs must not rebuild the editor each time.
    <Tabs
      className="tabs-root"
      activationMode="manual"
      value={editorMode}
      onValueChange={(mode) => !uploadCount && setEditorMode(mode as EditorMode)}
    >
      <DocumentLayout
        document={document}
        headings={rendered.headings}
        editBar={actions}
        titleInContent={editorMode === 'visual' && rendered.titleHeading}
      >
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
          <TabPanel value="visual" tabIndex={-1}>
            <Suspense fallback={<LoadingLines label="Loading editor…" />}>
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
          </TabPanel>
          <TabPanel value="source" tabIndex={-1}>
            <SourceEditor
              key={state.externalVersion}
              initialValue={state.content}
              onChange={(value) => session.setContent(value)}
              onSave={() => void session.saveNow()}
              onExit={doneSync}
              lineNumbers={settings.editor.lineNumbers}
              wordWrap={settings.editor.wordWrap}
              tabSize={settings.editor.tabSize}
              onUpload={upload}
              linkTargets={linkTargets}
              documentId={document.id}
            />
          </TabPanel>
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
    </Tabs>
  );
}
