import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
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
            disabled={selected === currentParent || isInvalid(selected)}
            loading={mutation.isPending}
          >
            Move
          </Button>
        </>
      }
    >
      <FormError message={mutation.error ? errorMessage(mutation.error) : null} />
      <FolderPicker
        root={tree.data}
        selected={selected}
        current={currentParent}
        isInvalid={isInvalid}
        onSelect={setSelected}
      />
    </Dialog>
  );
}

/**
 * Folder picker (UI_SPEC §66) as a WAI-ARIA tree, like the navigation: one Tab stop, ↑ ↓ move,
 * → expands or enters, ← collapses or goes to the parent, Enter or Space chooses the folder.
 */
function FolderPicker({
  root,
  selected,
  current,
  isInvalid,
  onSelect,
}: {
  root: TreeFolderNode | undefined;
  selected: string;
  current: string;
  isInvalid: (folder: string) => boolean;
  onSelect: (folder: string) => void;
}) {
  const [open, setOpen] = useState<Set<string>>(() => new Set(ancestorFolders(`${current}/x`)));
  const [focused, setFocused] = useState(current);
  const refs = useRef(new Map<string, HTMLDivElement>());

  const rows = useMemo(() => {
    const result: { folder: TreeFolderNode; level: number; parent: string | null }[] = [];
    const walk = (folder: TreeFolderNode, level: number, parent: string | null) => {
      result.push({ folder, level, parent });
      if (folder.path === '' || open.has(folder.path)) {
        for (const child of folder.children)
          if (child.type === 'folder') walk(child, level + 1, folder.path);
      }
    };
    if (root) walk(root, 1, null);
    return result;
  }, [root, open]);

  const setExpanded = (path: string, expanded: boolean) =>
    setOpen((previous) => {
      const next = new Set(previous);
      if (expanded) next.add(path);
      else next.delete(path);
      return next;
    });
  const focus = (path: string | undefined) => {
    if (path === undefined) return;
    setFocused(path);
    refs.current.get(path)?.focus();
  };
  const tabStop = rows.some((row) => row.folder.path === focused) ? focused : '';

  const onKeyDown = (event: KeyboardEvent, index: number) => {
    const row = rows[index]!;
    const path = row.folder.path;
    const hasChildren = row.folder.children.some((child) => child.type === 'folder');
    const isOpen = path === '' || open.has(path);
    switch (event.key) {
      case 'ArrowDown':
        focus(rows[index + 1]?.folder.path);
        break;
      case 'ArrowUp':
        focus(rows[index - 1]?.folder.path);
        break;
      case 'Home':
        focus(rows[0]?.folder.path);
        break;
      case 'End':
        focus(rows.at(-1)?.folder.path);
        break;
      case 'ArrowRight':
        if (hasChildren && !isOpen) setExpanded(path, true);
        else if (hasChildren) focus(rows[index + 1]?.folder.path);
        break;
      case 'ArrowLeft':
        if (path !== '' && hasChildren && isOpen) setExpanded(path, false);
        else if (row.parent !== null) focus(row.parent);
        break;
      case 'Enter':
      case ' ':
        if (!isInvalid(path)) onSelect(path);
        break;
      default:
        return;
    }
    event.preventDefault();
    // Enter must not also submit the dialog form.
    event.stopPropagation();
  };

  return (
    <div className="folder-picker" role="tree" aria-label="Target folder">
      {rows.map(({ folder, level }, index) => {
        const path = folder.path;
        const hasChildren = folder.children.some((child) => child.type === 'folder');
        const isOpen = path === '' || open.has(path);
        const disabled = isInvalid(path);
        return (
          <div
            key={path || '/'}
            ref={(element) => {
              if (element) refs.current.set(path, element);
              else refs.current.delete(path);
            }}
            role="treeitem"
            aria-level={level}
            aria-expanded={path !== '' && hasChildren ? isOpen : undefined}
            aria-selected={selected === path}
            aria-disabled={disabled || undefined}
            tabIndex={path === tabStop ? 0 : -1}
            data-autofocus={path === current ? true : undefined}
            className="folder-picker__row"
            style={{ paddingLeft: `calc(var(--space-2) + ${level - 1} * var(--tree-indent))` }}
            onFocus={() => setFocused(path)}
            onClick={() => !disabled && onSelect(path)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            <span
              className="folder-picker__chevron"
              aria-hidden="true"
              onClick={(event) => {
                if (path === '' || !hasChildren) return;
                event.stopPropagation();
                setExpanded(path, !isOpen);
              }}
            >
              {path !== '' && hasChildren ? (
                isOpen ? (
                  <ChevronDownIcon size={14} />
                ) : (
                  <ChevronRightIcon size={14} />
                )
              ) : null}
            </span>
            <FolderIcon size={15} aria-hidden="true" />
            <span>{path === '' ? 'Documentation' : folder.name}</span>
            {path === current && <span className="folder-picker__note">current</span>}
          </div>
        );
      })}
    </div>
  );
}
