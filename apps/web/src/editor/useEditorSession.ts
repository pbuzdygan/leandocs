import { useEffect, useState, useSyncExternalStore } from 'react';
import type { DocumentDto } from '@leandocs/shared';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { queryKeys } from '../api/queries';
import { localDraftStore, type DraftStore } from './drafts';
import { EditorSession } from './editor-session';
import { subscribeExternalChanges } from '../api/external-changes';
import { subscribeDocumentMutations } from '../api/document-mutations';

/** One EditorSession per opened document; saved documents update the query cache. */
export function useEditorSession(
  document: DocumentDto,
  drafts: DraftStore = localDraftStore,
  missing = false,
  autosave: { enabled: boolean; delay: number } = { enabled: true, delay: 1500 },
) {
  const queryClient = useQueryClient();
  const [session] = useState(
    () =>
      new EditorSession({
        id: document.id,
        content: document.content,
        revision: document.revision,
        drafts,
        autosave: autosave.enabled,
        autosaveDelay: autosave.delay,
        save: (content, expectedRevision) =>
          api.updateDocument(document.id, { content, expectedRevision }),
        onReload: (loaded) => {
          queryClient.setQueryData(queryKeys.document(loaded.id), loaded);
        },
        onSaved: (saved) => {
          queryClient.setQueryData(queryKeys.document(saved.id), saved);
          void queryClient.invalidateQueries({ queryKey: queryKeys.tree });
          void queryClient.invalidateQueries({ queryKey: queryKeys.recent });
        },
      }),
  );
  const state = useSyncExternalStore(session.subscribe, session.getState);
  useEffect(() => subscribeDocumentMutations((changed) => session.syncFromApp(changed)), [session]);
  useEffect(
    () =>
      subscribeExternalChanges((changes) => {
        if (
          changes.documents.some((change) => change.id === document.id && change.kind !== 'added')
        )
          session.markExternalChange();
      }),
    [session, document.id],
  );
  useEffect(() => {
    if (missing) session.markExternalChange();
  }, [session, missing]);

  // Refetched revisions resolve the conflict target without replacing editor content.
  useEffect(() => {
    session.syncFromServer(document);
  }, [session, document]);

  // Leaving the editor: write the draft and save pending changes.
  useEffect(() => () => session.flushOnLeave(), [session]);

  // Warn before closing the tab with unsaved work.
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      const { status } = session.getState();
      if (session.isDirty || status === 'saving') event.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [session]);

  return { session, state };
}
