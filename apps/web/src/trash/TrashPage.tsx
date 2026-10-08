import { useState } from 'react';
import { useNavigate } from 'react-router';
import type { TrashItem } from '@leandocs/shared';
import { api, errorMessage } from '../api/client';
import { useContentMutation, useTrash } from '../api/queries';
import { FileIcon, FolderIcon, RestoreIcon, TrashIcon } from '../components/icons';
import { Button } from '../components/ui/Button';
import { Dialog } from '../components/ui/Dialog';
import { FormError } from '../components/ui/Field';
import { EmptyState, ErrorState, SkeletonLines } from '../components/ui/States';
import { useNotify } from '../components/ui/Toast';
import { useNavigationState } from '../navigation/NavigationContext';
import { displayFolder, formatDate, formatRelativeTime, parentPath } from '../utils/format';
import { usePageTitle } from '../utils/page-title';
import './trash.css';

/** Documents show their title; folders (and documents without one) their name. */
const itemLabel = (item: TrashItem) => item.title ?? item.name.replace(/\.md$/i, '');

type Confirm = { type: 'item'; item: TrashItem } | { type: 'all'; count: number } | null;

/**
 * Trash (UI_SPEC §136, PROJECT_SPEC §38): Name · Original location · Deleted, with Restore and
 * Delete permanently per item and Empty trash. Permanent deletion always asks first.
 */
export function TrashPage() {
  usePageTitle('Trash');
  const trash = useTrash();
  const notify = useNotify();
  const navigate = useNavigate();
  const { reveal } = useNavigationState();
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [busy, setBusy] = useState<string>();

  const restore = useContentMutation(api.restoreTrashItem);
  const remove = useContentMutation(api.deleteTrashItem);
  const empty = useContentMutation(api.emptyTrash);

  const onRestore = (item: TrashItem) => {
    const label = itemLabel(item);
    setBusy(item.trashId);
    restore.mutate(item.trashId, {
      onSuccess: (restored) => {
        reveal(restored.path);
        const message = `"${label}" restored to ${displayFolder(parentPath(restored.path))}`;
        const id = restored.documentId;
        notify.info(
          message,
          id
            ? { label: 'Open', onClick: () => void navigate(`/doc/${encodeURIComponent(id)}`) }
            : undefined,
        );
      },
      onError: (error) => notify.error(errorMessage(error)),
      onSettled: () => setBusy(undefined),
    });
  };

  const closeConfirm = () => {
    setConfirm(null);
    remove.reset();
    empty.reset();
  };

  const onConfirm = () => {
    if (confirm?.type === 'item') {
      const label = itemLabel(confirm.item);
      remove.mutate(confirm.item.trashId, {
        onSuccess: () => {
          setConfirm(null);
          notify.info(`"${label}" deleted permanently`);
        },
      });
    } else if (confirm?.type === 'all') {
      empty.mutate(undefined, {
        onSuccess: ({ deleted }) => {
          setConfirm(null);
          notify.info(
            deleted === 1 ? '1 item deleted permanently' : `${deleted} items deleted permanently`,
          );
        },
      });
    }
  };

  if (trash.isError)
    return (
      <ErrorState
        title="The trash is unavailable"
        message={errorMessage(trash.error)}
        onRetry={() => void trash.refetch()}
        level={1}
      />
    );
  if (!trash.data)
    return (
      <div className="trash" aria-busy="true">
        <SkeletonLines count={5} />
      </div>
    );

  const { items } = trash.data;
  if (items.length === 0)
    return (
      <EmptyState icon={<TrashIcon size={32} />} title="Trash is empty" level={1}>
        Deleted documents and folders appear here until you delete them permanently.
      </EmptyState>
    );

  const pending = confirm?.type === 'item' ? remove : empty;
  return (
    <div className="trash">
      <div className="trash__header">
        <h1 className="trash__title">Trash</h1>
        <Button variant="danger" onClick={() => setConfirm({ type: 'all', count: items.length })}>
          Empty trash
        </Button>
      </div>
      <p className="trash__note">
        Deleted documents and folders stay here until you delete them permanently. Restoring puts an
        item back where it was, with its attachments.
      </p>
      <table className="trash__table">
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col">Original location</th>
            <th scope="col">Deleted</th>
            <th scope="col">
              <span className="visually-hidden">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const label = itemLabel(item);
            return (
              <tr key={item.trashId}>
                <th scope="row" className="trash__name">
                  {item.kind === 'folder' ? (
                    <FolderIcon size={16} role="img" aria-label="Folder" />
                  ) : (
                    <FileIcon size={16} role="img" aria-label="Document" />
                  )}
                  <span>{label}</span>
                </th>
                <td data-label="Original location">
                  {displayFolder(parentPath(item.originalPath))}
                </td>
                <td data-label="Deleted" className="trash__deleted">
                  <time dateTime={item.deletedAt} title={formatDate(item.deletedAt)}>
                    {formatRelativeTime(item.deletedAt)}
                  </time>
                </td>
                <td className="trash__actions">
                  <Button
                    size="small"
                    onClick={() => onRestore(item)}
                    disabled={busy === item.trashId}
                    aria-label={`Restore ${label}`}
                  >
                    <RestoreIcon size={14} aria-hidden="true" /> Restore
                  </Button>
                  <Button
                    size="small"
                    variant="danger"
                    onClick={() => setConfirm({ type: 'item', item })}
                    // The accessible name starts with the visible text (WCAG 2.5.3).
                    aria-label={`Delete permanently ${label}`}
                  >
                    Delete permanently
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {confirm && (
        <Dialog
          open
          onOpenChange={(open) => !open && closeConfirm()}
          title={confirm.type === 'item' ? 'Delete permanently?' : 'Empty trash?'}
          description={
            confirm.type === 'item'
              ? `${itemLabel(confirm.item)}${confirm.item.kind === 'folder' ? ' and everything in it' : ''} will be deleted from disk. This cannot be undone.`
              : `${confirm.count === 1 ? 'The item' : `All ${confirm.count} items`} in the trash will be deleted from disk. This cannot be undone.`
          }
          width={460}
          actions={
            <>
              <Button onClick={closeConfirm} autoFocus>
                Cancel
              </Button>
              <Button variant="danger" onClick={onConfirm} disabled={pending.isPending}>
                {confirm.type === 'item' ? 'Delete permanently' : 'Empty trash'}
              </Button>
            </>
          }
        >
          <FormError message={pending.error ? errorMessage(pending.error) : null} />
        </Dialog>
      )}
    </div>
  );
}
