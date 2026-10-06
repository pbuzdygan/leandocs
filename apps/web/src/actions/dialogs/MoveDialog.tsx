import { useMemo, useState } from 'react';
import type { TreeFolderNode } from '@leandocs/shared';
import { ChevronDownIcon, ChevronRightIcon, FolderIcon } from '../../components/icons';
import { api, errorMessage } from '../../api/client';
import { useContentMutation, useTree } from '../../api/queries';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { FormError } from '../../components/ui/Field';
import { useNavigationState } from '../../navigation/NavigationContext';
import { ancestorFolders, isSameOrInside } from '../../navigation/tree-utils';
import { displayFolder, parentPath } from '../../utils/format';
import { targetLabel, type ItemTarget } from '../targets';
import { useNotify } from '../../components/ui/Toast';

/** UI_SPEC §66: a simple folder picker. */
export function MoveDialog({ target, onClose }: { target: ItemTarget; onClose: () => void }) {
  const tree = useTree();
  const notify = useNotify();
  const { reveal } = useNavigationState();
  const currentParent = parentPath(target.path);
  const [selected, setSelected] = useState(currentParent);
  const [open, setOpen] = useState<Set<string>>(
    () => new Set(ancestorFolders(`${currentParent}/x`)),
  );
  const mutation = useContentMutation(async (folder: string) =>
    target.kind === 'document'
      ? (await api.moveDocument(target.id, { folder })).path
      : (await api.moveFolder({ path: target.path, targetFolder: folder })).path,
  );

  const isInvalid = (folder: string) =>
    target.kind === 'folder' && isSameOrInside(folder, target.path);
  const submit = () => {
    if (selected === currentParent || isInvalid(selected) || mutation.isPending) return;
    mutation.mutate(selected, {
      onSuccess: (path) => {
        reveal(path);
        notify.info(`Moved to ${displayFolder(selected)}`);
        onClose();
      },
    });
  };

  const rows = useMemo(() => {
    const result: { folder: TreeFolderNode; level: number }[] = [];
    const walk = (folder: TreeFolderNode, level: number) => {
      result.push({ folder, level });
      if (folder.path === '' || open.has(folder.path)) {
        for (const child of folder.children) if (child.type === 'folder') walk(child, level + 1);
      }
    };
    if (tree.data) walk(tree.data, 0);
    return result;
  }, [tree.data, open]);

  return (
    <Dialog
      open
      onOpenChange={(isOpen) => !isOpen && onClose()}
      title={`Move "${targetLabel(target)}"`}
      onSubmit={submit}
      actions={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            type="submit"
            variant="primary"
            disabled={selected === currentParent || isInvalid(selected) || mutation.isPending}
          >
            Move
          </Button>
        </>
      }
    >
      <FormError message={mutation.error ? errorMessage(mutation.error) : null} />
      <div className="folder-picker" role="listbox" aria-label="Target folder">
        {rows.map(({ folder, level }) => {
          const hasChildren = folder.children.some((child) => child.type === 'folder');
          const disabled = isInvalid(folder.path);
          return (
            <div
              key={folder.path || '/'}
              role="option"
              aria-selected={selected === folder.path}
              aria-disabled={disabled || undefined}
              tabIndex={disabled ? -1 : 0}
              data-autofocus={folder.path === currentParent ? true : undefined}
              className="folder-picker__row"
              style={{ paddingLeft: 8 + level * 16 }}
              onClick={() => !disabled && setSelected(folder.path)}
              onKeyDown={(event) => {
                if ((event.key === 'Enter' || event.key === ' ') && !disabled) {
                  event.preventDefault();
                  setSelected(folder.path);
                }
              }}
            >
              {folder.path !== '' && hasChildren ? (
                <button
                  type="button"
                  className="folder-picker__chevron"
                  aria-label={open.has(folder.path) ? 'Collapse' : 'Expand'}
                  onClick={(event) => {
                    event.stopPropagation();
                    setOpen((current) => {
                      const next = new Set(current);
                      if (next.has(folder.path)) next.delete(folder.path);
                      else next.add(folder.path);
                      return next;
                    });
                  }}
                >
                  {open.has(folder.path) ? (
                    <ChevronDownIcon size={14} />
                  ) : (
                    <ChevronRightIcon size={14} />
                  )}
                </button>
              ) : (
                <span className="folder-picker__chevron" />
              )}
              <FolderIcon size={15} />
              <span>{folder.path === '' ? 'Documentation' : folder.name}</span>
              {folder.path === currentParent && (
                <span className="folder-picker__note">current</span>
              )}
            </div>
          );
        })}
      </div>
    </Dialog>
  );
}
