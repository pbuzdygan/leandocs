import { useEffect, useMemo } from 'react';
import type { DocumentDto, TreeFolderNode } from '@leandocs/shared';
import { MoreIcon } from '../components/icons';
import { useTree } from '../api/queries';
import { useContentActions } from '../actions/ContentActions';
import { itemMenuEntries } from '../actions/menu-entries';
import { IconButton } from '../components/ui/IconButton';
import { DropdownMenuButton } from '../components/ui/Menu';
import type { LinkTarget } from '../markdown/links';
import { renderMarkdown } from '../markdown/pipeline';

/** Shared by the document view and the editor (split from DocumentPage, UI_SPEC §139). */

export const docUrl = (id: string, edit = false) =>
  `/doc/${encodeURIComponent(id)}${edit ? '/edit' : ''}`;

/** All documents in the tree, for link resolution. */
export function collectTargets(root: TreeFolderNode | undefined): LinkTarget[] {
  const result: LinkTarget[] = [];
  const walk = (folder: TreeFolderNode) => {
    for (const child of folder.children) {
      if (child.type === 'document')
        result.push({
          id: child.id,
          title: child.title,
          path: child.path,
          ...(child.aliases ? { aliases: child.aliases } : {}),
        });
      else walk(child);
    }
  };
  if (root) walk(root);
  return result;
}

export function useRendered(document: DocumentDto) {
  const tree = useTree();
  return useMemo(
    () =>
      // A document the server could not analyse safely is never parsed here either (ADR-0025).
      renderMarkdown(document.analysisLimited ? '' : document.content, {
        documentPath: document.path,
        title: document.title,
        documents: collectTargets(tree.data),
      }),
    [document.content, document.analysisLimited, document.path, document.title, tree.data],
  );
}

/** Ctrl/Cmd+E toggles View ↔ Edit (PROJECT_SPEC §45). */
export function useToggleShortcut(action: () => void) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'e') {
        event.preventDefault();
        action();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [action]);
}
export function MoreMenu({ document }: { document: DocumentDto }) {
  const actions = useContentActions();
  const target = {
    kind: 'document' as const,
    id: document.id,
    title: document.title,
    path: document.path,
  };
  return (
    <DropdownMenuButton
      entries={itemMenuEntries(target, actions)}
      trigger={
        <IconButton label="More actions">
          <MoreIcon size={16} />
        </IconButton>
      }
    />
  );
}
