import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { AddIcon, NewFileIcon, NewFolderIcon } from '../components/icons';
import { useLocation, useMatch } from 'react-router';
import { errorMessage } from '../api/client';
import { useTree } from '../api/queries';
import { useContentActions } from '../actions/ContentActions';
import type { ItemTarget } from '../actions/targets';
import { Button } from '../components/ui/Button';
import { IconButton } from '../components/ui/IconButton';
import { DropdownMenuButton } from '../components/ui/Menu';
import { SkeletonLines } from '../components/ui/States';
import { MEDIA, useMediaQuery } from '../utils/media';
import { readPreference, writePreference } from '../utils/storage';
import { NAVIGATION_DRAWER_ID, useNavigationState } from './NavigationContext';
import { NavigationTree, dropTargetProps } from './NavigationTree';
import { PinnedSection } from './PinnedSection';
import { findDocument } from './tree-utils';
import './navigation.css';

export const SIDEBAR_MIN = 220;
export const SIDEBAR_MAX = 400;
const SIDEBAR_DEFAULT = 280;

export function clampWidth(width: number): number {
  return Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, Math.round(width)));
}

/** UI_SPEC §17–19: resizable (220–400 px, remembered), header with "+" menu, filesystem tree. */
export function NavigationSidebar() {
  const tree = useTree();
  const actions = useContentActions();
  const { reveal, drawerOpen, setDrawerOpen } = useNavigationState();
  const match = useMatch('/doc/:id/*');
  const activeId = match?.params.id;
  const [width, setWidth] = useState(() =>
    clampWidth(readPreference('sidebar.width', SIDEBAR_DEFAULT)),
  );
  const [dragging, setDragging] = useState<ItemTarget | null>(null);
  const [rootDrop, setRootDrop] = useState(false);
  const resize = useRef<{ startX: number; startWidth: number } | null>(null);
  const navRef = useRef<HTMLElement>(null);
  const mobile = useMediaQuery(MEDIA.mobile);
  const { pathname } = useLocation();

  // Phones (UI_SPEC §101, §103): the drawer closes on every navigation; when it opens, focus moves
  // to the current tree row (else the first control), and Esc returns focus to the menu button.
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname, setDrawerOpen]);
  useEffect(() => {
    if (!mobile || !drawerOpen) return;
    const nav = navRef.current;
    const target =
      nav?.querySelector<HTMLElement>('[role="treeitem"][tabindex="0"]') ??
      nav?.querySelector<HTMLElement>('button, a[href]');
    target?.focus();
  }, [mobile, drawerOpen]);
  const onDrawerKey = (event: KeyboardEvent<HTMLElement>) => {
    // Menus opened from the drawer render in a portal and close themselves on Esc.
    if (event.key !== 'Escape' || !mobile || !drawerOpen) return;
    if (!(event.target instanceof Node) || !navRef.current?.contains(event.target)) return;
    setDrawerOpen(false);
    document.querySelector<HTMLElement>(`[aria-controls="${NAVIGATION_DRAWER_ID}"]`)?.focus();
  };

  // Reveal the open document in the tree (expand its folders).
  const activePath = activeId && tree.data ? findDocument(tree.data, activeId)?.path : undefined;
  useEffect(() => {
    if (activePath) reveal(activePath);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the active path changes
  }, [activePath]);

  const commitWidth = (next: number) => {
    const clamped = clampWidth(next);
    setWidth(clamped);
    writePreference('sidebar.width', clamped);
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    resize.current = { startX: event.clientX, startWidth: width };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (resize.current) {
      setWidth(clampWidth(resize.current.startWidth + event.clientX - resize.current.startX));
    }
  };
  const onPointerUp = () => {
    if (resize.current) commitWidth(width);
    resize.current = null;
  };
  const onSeparatorKey = (event: KeyboardEvent) => {
    if (event.key === 'ArrowLeft') commitWidth(width - 16);
    else if (event.key === 'ArrowRight') commitWidth(width + 16);
    else return;
    event.preventDefault();
  };

  return (
    <>
      {drawerOpen && <div className="drawer-backdrop" onClick={() => setDrawerOpen(false)} />}
      <nav
        ref={navRef}
        id={NAVIGATION_DRAWER_ID}
        className={drawerOpen ? 'sidebar sidebar--open' : 'sidebar'}
        style={{ width }}
        aria-label="Documentation navigation"
        // A closed drawer is off-screen: keep it out of the tab order and the accessibility tree.
        inert={mobile && !drawerOpen}
        onKeyDown={onDrawerKey}
      >
        <div
          className={rootDrop ? 'sidebar__header sidebar__header--drop' : 'sidebar__header'}
          {...dropTargetProps(dragging, (item) => actions.moveTo(item, ''), setRootDrop)}
        >
          <span className="sidebar__title">Documentation</span>
          <DropdownMenuButton
            entries={[
              {
                label: 'New document',
                icon: <NewFileIcon size={15} />,
                onSelect: () => actions.newDocument(),
              },
              {
                label: 'New folder',
                icon: <NewFolderIcon size={15} />,
                onSelect: () => actions.newFolder(''),
              },
            ]}
            trigger={
              <IconButton label="New document or folder">
                <AddIcon size={16} />
              </IconButton>
            }
          />
        </div>
        <div className="sidebar__body">
          <PinnedSection activeId={activeId} />
          {tree.isPending && (
            <SkeletonLines count={6} widths={['70%', '55%', '80%', '45%', '60%', '50%']} />
          )}
          {tree.isError && (
            <div className="sidebar__message" role="alert">
              <p>{errorMessage(tree.error)}</p>
              <Button size="small" onClick={() => void tree.refetch()}>
                Retry
              </Button>
            </div>
          )}
          {tree.data && tree.data.children.length === 0 && (
            <div className="sidebar__message">
              <p>No documents yet.</p>
              <Button size="small" onClick={() => actions.newDocument()}>
                New document
              </Button>
            </div>
          )}
          {tree.data && tree.data.children.length > 0 && (
            <NavigationTree
              root={tree.data}
              activeId={activeId}
              dragging={dragging}
              onDragChange={setDragging}
            />
          )}
        </div>
        <div
          className="sidebar__resizer"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize navigation"
          aria-valuemin={SIDEBAR_MIN}
          aria-valuemax={SIDEBAR_MAX}
          aria-valuenow={width}
          tabIndex={0}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onKeyDown={onSeparatorKey}
          onDoubleClick={() => commitWidth(SIDEBAR_DEFAULT)}
        />
      </nav>
    </>
  );
}
