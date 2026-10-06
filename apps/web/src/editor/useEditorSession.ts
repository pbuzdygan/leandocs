import { useEffect, useState, useSyncExternalStore } from 'react';
import type { DocumentDto } from '@leandocs/shared';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { queryKeys } from '../api/queries';
import { localDraftStore, type DraftStore } from './drafts';
import { EditorSession } from './editor-session';

/** One EditorSession per opened document; saved documents update the query cache. */
export function useEditorSession(document: DocumentDto, drafts: DraftStore = localDraftStore) {
  const queryClient = useQueryClient();
  const [session] = useState(
    () =>
      new EditorSession({
        id: document.id,
        content: document.content,
        revision: document.revision,
        drafts,
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

  // Follow the server version while there are no local changes (e.g. refetch after an outside edit).
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
