import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { api, errorMessage } from '../api/client';
import { queryKeys, usePins } from '../api/queries';
import { useNotify } from '../components/ui/Toast';
import { useNavigationState } from '../navigation/NavigationContext';
import { displayFolder } from '../utils/format';
import { DeleteDialog } from './dialogs/DeleteDialog';
import { MoveDialog } from './dialogs/MoveDialog';
import { NewDocumentDialog } from './dialogs/NewDocumentDialog';
import { NewFolderDialog } from './dialogs/NewFolderDialog';
import { RenameDialog } from './dialogs/RenameDialog';
import { targetLabel, type ItemTarget } from './targets';

type DialogState =
  | { type: 'new-document'; folder: string }
  | { type: 'new-folder'; parent: string }
  | { type: 'rename' | 'move' | 'delete'; target: ItemTarget }
  | null;

export interface ContentActions {
  editDocument: (id: string) => void;
  newDocument: (folder?: string) => void;
  newFolder: (parent?: string) => void;
  rename: (target: ItemTarget) => void;
  move: (target: ItemTarget) => void;
  remove: (target: ItemTarget) => void;
  /** Direct move without a dialog (drag & drop). */
  moveTo: (target: ItemTarget, folder: string) => void;
  copyPath: (path: string) => void;
  copyLink: (id: string) => void;
  /** P10-05: pin state comes from `GET /pins`. */
  isPinned: (id: string) => boolean;
  togglePin: (id: string) => void;
  /** Toast with an Undo action after something was moved to the trash. */
  announceTrashed: (label: string, trashId: string) => void;
}

const ContentActionsContext = createContext<ContentActions | null>(null);

/**
 * One place for every content action, shared by the tree, its context menus, the document
 * header and the topbar. Owns the dialogs so they work from anywhere.
 */
export function ContentActionsProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<DialogState>(null);
  const queryClient = useQueryClient();
  const notify = useNotify();
  const navigate = useNavigate();
  const { reveal } = useNavigationState();

  const refresh = useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.tree }),
        queryClient.invalidateQueries({ queryKey: queryKeys.recent }),
        queryClient.invalidateQueries({ queryKey: queryKeys.documents }),
      ]),
    [queryClient],
  );

  const copy = useCallback(
    (text: string, message: string) => {
      navigator.clipboard.writeText(text).then(
        () => notify.info(message),
        () => notify.error('Could not access the clipboard.'),
      );
    },
    [notify],
  );

  const pins = usePins();
  const pinned = useMemo(
    () => new Set((pins.data?.items ?? []).map((item) => item.id)),
    [pins.data],
  );

  const actions = useMemo<ContentActions>(
    () => ({
      isPinned: (id) => pinned.has(id),
      togglePin: (id) => {
        const wasPinned = pinned.has(id);
        (wasPinned ? api.unpin(id) : api.pin(id))
          .then(() => notify.info(wasPinned ? 'Unpinned' : 'Pinned'))
          .catch((error: unknown) => notify.error(errorMessage(error)))
          .finally(() => void queryClient.invalidateQueries({ queryKey: queryKeys.pins }));
      },
      editDocument: (id) => void navigate(`/doc/${encodeURIComponent(id)}/edit`),
      newDocument: (folder = '') => setDialog({ type: 'new-document', folder }),
      newFolder: (parent = '') => setDialog({ type: 'new-folder', parent }),
      rename: (target) => setDialog({ type: 'rename', target }),
      move: (target) => setDialog({ type: 'move', target }),
      remove: (target) => setDialog({ type: 'delete', target }),
      moveTo: (target, folder) => {
        const request =
          target.kind === 'document'
            ? api.moveDocument(target.id, { folder }).then((document) => document.path)
            : api.moveFolder({ path: target.path, targetFolder: folder }).then((dto) => dto.path);
        request
          .then((path) => {
            reveal(path);
            notify.info(`Moved "${targetLabel(target)}" to ${displayFolder(folder)}`);
          })
          .catch((error: unknown) => notify.error(errorMessage(error)))
          .finally(() => void refresh());
      },
      copyPath: (path) => copy(path, 'Path copied'),
      copyLink: (id) =>
        copy(`${window.location.origin}/doc/${encodeURIComponent(id)}`, 'Link copied'),
      announceTrashed: (label, trashId) =>
        notify.info(`"${label}" moved to Trash`, {
          label: 'Undo',
          onClick: () => {
            api
              .restoreTrashItem(trashId)
              .then((restored) => {
                reveal(restored.path);
                notify.info(`"${label}" restored`);
                if (restored.documentId) {
                  void navigate(`/doc/${encodeURIComponent(restored.documentId)}`);
                }
              })
              .catch((error: unknown) => notify.error(errorMessage(error)))
              .finally(() => void refresh());
          },
        }),
    }),
    [copy, navigate, notify, pinned, queryClient, refresh, reveal],
  );

  const close = () => setDialog(null);
  return (
    <ContentActionsContext.Provider value={actions}>
      {children}
      {dialog?.type === 'new-document' && (
        <NewDocumentDialog folder={dialog.folder} onClose={close} />
      )}
      {dialog?.type === 'new-folder' && <NewFolderDialog parent={dialog.parent} onClose={close} />}
      {dialog?.type === 'rename' && <RenameDialog target={dialog.target} onClose={close} />}
      {dialog?.type === 'move' && <MoveDialog target={dialog.target} onClose={close} />}
      {dialog?.type === 'delete' && <DeleteDialog target={dialog.target} onClose={close} />}
    </ContentActionsContext.Provider>
  );
}

export function useContentActions(): ContentActions {
  const value = useContext(ContentActionsContext);
  if (!value) throw new Error('useContentActions must be used inside ContentActionsProvider');
  return value;
}
