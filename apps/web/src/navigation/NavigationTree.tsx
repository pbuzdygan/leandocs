import { useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import type { TreeFolderNode, TreeNode } from '@leandocs/shared';
import {
  ChevronDownIcon,
  ChevronRightIcon,
  FileIcon,
  FolderIcon,
  FolderOpenIcon,
  MoreIcon,
} from '../components/icons';
import { useNavigate } from 'react-router';
import { useContentActions } from '../actions/ContentActions';
import { itemMenuEntries } from '../actions/menu-entries';
import type { ItemTarget } from '../actions/targets';
import { ContextMenuArea, DropdownMenuButton } from '../components/ui/Menu';
import { parentPath } from '../utils/format';
import { useNavigationState } from './NavigationContext';
import { flattenVisible, isSameOrInside } from './tree-utils';
import './navigation.css';

const DRAG_TYPE = 'application/x-leandocs-item';

function keyOf(node: TreeNode): string {
  return node.type === 'document' ? `d:${node.id}` : `f:${node.path}`;
}

function toTarget(node: TreeNode): ItemTarget {
  return node.type === 'document'
    ? { kind: 'document', id: node.id, title: node.title, path: node.path }
    : { kind: 'folder', path: node.path, name: node.name };
}

/** Where `item` may be dropped: never into itself/descendants, never where it already is. */
export function canDrop(item: ItemTarget, folder: string): boolean {
  if (parentPath(item.path) === folder) return false;
  return !(item.kind === 'folder' && isSameOrInside(folder, item.path));
}

interface NavigationTreeProps {
  root: TreeFolderNode;
  activeId: string | undefined;
  /** Shared drag state so the sidebar header can act as the "root" drop target. */
  dragging: ItemTarget | null;
  onDragChange: (item: ItemTarget | null) => void;
}

/**
 * Filesystem tree (UI_SPEC §18–23, §95, §112). WAI-ARIA tree pattern with roving tabindex.
 * Hierarchy is shown by indentation, chevrons and icons — no guide lines.
 */
export function NavigationTree({ root, activeId, dragging, onDragChange }: NavigationTreeProps) {
  const { expanded, toggle, setExpanded, setDrawerOpen } = useNavigationState();
  const actions = useContentActions();
  const navigate = useNavigate();
  const rows = useMemo(() => flattenVisible(root, expanded), [root, expanded]);
  const activeKey = activeId ? `d:${activeId}` : undefined;
  const [focusKey, setFocusKey] = useState<string | undefined>(undefined);
  const [dropFolder, setDropFolder] = useState<string | null>(null);
  const refs = useRef(new Map<string, HTMLDivElement>());
  const keyboardMove = useRef(false);

  // The tab stop is the focused row, else the active document, else the first row.
  const tabKey =
    (focusKey && rows.some((row) => keyOf(row.node) === focusKey) && focusKey) ||
    (activeKey && rows.some((row) => keyOf(row.node) === activeKey) && activeKey) ||
    (rows[0] && keyOf(rows[0].node));

  useEffect(() => {
    if (keyboardMove.current && focusKey) refs.current.get(focusKey)?.focus();
    keyboardMove.current = false;
  }, [focusKey]);

  const open = (node: TreeNode) => {
    if (node.type === 'document') {
      void navigate(`/doc/${encodeURIComponent(node.id)}`);
      setDrawerOpen(false);
    } else {
      toggle(node.path);
    }
  };

  const moveFocus = (key: string | undefined) => {
    if (!key) return;
    keyboardMove.current = true;
    setFocusKey(key);
  };

  const onKeyDown = (event: KeyboardEvent, index: number) => {
    const row = rows[index];
    if (!row) return;
    const { node } = row;
    const isOpenFolder = node.type === 'folder' && expanded.has(node.path);
    let handled = true;
    switch (event.key) {
      case 'ArrowDown':
        moveFocus(rows[index + 1] && keyOf(rows[index + 1]!.node));
        break;
      case 'ArrowUp':
        moveFocus(rows[index - 1] && keyOf(rows[index - 1]!.node));
        break;
      case 'Home':
        moveFocus(rows[0] && keyOf(rows[0].node));
        break;
      case 'End':
        moveFocus(rows.at(-1) && keyOf(rows.at(-1)!.node));
        break;
      case 'ArrowRight':
        if (node.type === 'document') open(node);
        else if (!isOpenFolder) setExpanded(node.path, true);
        else moveFocus(rows[index + 1] && keyOf(rows[index + 1]!.node));
        break;
      case 'ArrowLeft':
        if (isOpenFolder) setExpanded(node.path, false);
        else {
          const parent = parentPath(node.path);
          if (parent !== '') moveFocus(`f:${parent}`);
        }
        break;
      case 'Enter':
        open(node);
        break;
      case 'F2':
        actions.rename(toTarget(node));
        break;
      case 'Delete':
        actions.remove(toTarget(node));
        break;
      default:
        handled = false;
    }
    if (handled) event.preventDefault();
  };

  const dropProps = (folder: string) => ({
    onDragOver: (event: DragEvent) => {
      if (!dragging || !canDrop(dragging, folder)) return;
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = 'move';
      setDropFolder(folder);
    },
    onDragLeave: () => setDropFolder((current) => (current === folder ? null : current)),
    onDrop: (event: DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      setDropFolder(null);
      if (dragging && canDrop(dragging, folder)) actions.moveTo(dragging, folder);
      onDragChange(null);
    },
  });

  return (
    <div role="tree" aria-label="Documentation" className="tree">
      {rows.map(({ node, level }, index) => {
        const key = keyOf(node);
        const target = toTarget(node);
        const isFolder = node.type === 'folder';
        const isOpen = isFolder && expanded.has(node.path);
        const entries = itemMenuEntries(target, actions, isFolder ? undefined : () => open(node));
        const label = node.type === 'document' ? node.title : node.name;
        return (
          <ContextMenuArea key={key} entries={entries}>
            <div
              ref={(element) => {
                if (element) refs.current.set(key, element);
                else refs.current.delete(key);
              }}
              role="treeitem"
              aria-label={label}
              aria-level={level}
              aria-expanded={isFolder ? isOpen : undefined}
              aria-selected={key === activeKey}
              tabIndex={key === tabKey ? 0 : -1}
              className={[
                'tree-row',
                key === activeKey && 'tree-row--active',
                isFolder && dropFolder === node.path && 'tree-row--drop',
              ]
                .filter(Boolean)
                .join(' ')}
              style={{ paddingLeft: `calc(var(--space-2) + ${level - 1} * var(--tree-indent))` }}
              title={node.type === 'document' ? node.path : undefined}
              draggable
              onDragStart={(event) => {
                event.dataTransfer.setData(DRAG_TYPE, node.path);
                event.dataTransfer.effectAllowed = 'move';
                onDragChange(target);
              }}
              onDragEnd={() => {
                onDragChange(null);
                setDropFolder(null);
              }}
              {...(isFolder ? dropProps(node.path) : {})}
              onClick={() => {
                setFocusKey(key);
                open(node);
              }}
              onFocus={() => setFocusKey(key)}
              onKeyDown={(event) => onKeyDown(event, index)}
            >
              <span className="tree-row__chevron" aria-hidden="true">
                {isFolder &&
                  (isOpen ? <ChevronDownIcon size={14} /> : <ChevronRightIcon size={14} />)}
              </span>
              <span className="tree-row__icon" aria-hidden="true">
                {isFolder ? (
                  isOpen ? (
                    <FolderOpenIcon size={15} />
                  ) : (
                    <FolderIcon size={15} />
                  )
                ) : (
                  <FileIcon size={15} />
                )}
              </span>
              <span className="tree-row__label">{label}</span>
              <span className="tree-row__actions" onClick={(event) => event.stopPropagation()}>
                <DropdownMenuButton
                  entries={entries}
                  trigger={
                    <button
                      type="button"
                      className="icon-btn tree-row__more"
                      aria-label={`Actions for ${label}`}
                      tabIndex={-1}
                    >
                      <MoreIcon size={15} />
                    </button>
                  }
                />
              </span>
            </div>
          </ContextMenuArea>
        );
      })}
    </div>
  );
}

/** Root drop target props (used by the sidebar header). */
export function dropTargetProps(
  dragging: ItemTarget | null,
  onDrop: (item: ItemTarget) => void,
  setActive: (active: boolean) => void,
) {
  return {
    onDragOver: (event: DragEvent) => {
      if (!dragging || !canDrop(dragging, '')) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      setActive(true);
    },
    onDragLeave: () => setActive(false),
    onDrop: (event: DragEvent) => {
      event.preventDefault();
      setActive(false);
      if (dragging && canDrop(dragging, '')) onDrop(dragging);
    },
  };
}
