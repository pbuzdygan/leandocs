import { useMatch, useNavigate } from 'react-router';
import { api, errorMessage } from '../../api/client';
import { useContentMutation, useTree } from '../../api/queries';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { FormError } from '../../components/ui/Field';
import { useNotify } from '../../components/ui/Toast';
import { findDocument, isSameOrInside } from '../../navigation/tree-utils';
import { useContentActions } from '../ContentActions';
import { targetLabel, type ItemTarget } from '../targets';

/** UI_SPEC §67: move to trash (restorable). Permanent delete only happens in the trash. */
export function DeleteDialog({ target, onClose }: { target: ItemTarget; onClose: () => void }) {
  const navigate = useNavigate();
  const notify = useNotify();
  const tree = useTree();
  const match = useMatch('/doc/:id/*');
  const label = targetLabel(target);
  const { announceTrashed } = useContentActions();
  const remove = useContentMutation(async () =>
    target.kind === 'document'
      ? { trashed: true, trashItem: await api.trashDocument(target.id) }
      : api.deleteFolder(target.path),
  );

  const openDocument =
    match?.params.id && tree.data ? findDocument(tree.data, match.params.id) : undefined;
  const affectsOpenDocument =
    openDocument !== undefined &&
    (target.kind === 'document'
      ? openDocument.id === target.id
      : isSameOrInside(openDocument.path, target.path));

  const confirm = () =>
    remove.mutate(undefined, {
      onSuccess: (result) => {
        if (affectsOpenDocument) void navigate('/');
        onClose();
        if (result.trashed && result.trashItem) {
          announceTrashed(label, result.trashItem.trashId);
        } else {
          notify.info(`Empty folder "${label}" deleted`);
        }
      },
    });

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={target.kind === 'document' ? 'Move document to trash?' : 'Move folder to trash?'}
      description={
        target.kind === 'document'
          ? `${label} will be moved to Trash and can be restored.`
          : `${label} and everything in it will be moved to Trash and can be restored.`
      }
      width={460}
      actions={
        <>
          <Button onClick={onClose} autoFocus>
            Cancel
          </Button>
          <Button variant="danger" onClick={confirm} disabled={remove.isPending}>
            Move to Trash
          </Button>
        </>
      }
    >
      <FormError message={remove.error ? errorMessage(remove.error) : null} />
    </Dialog>
  );
}
