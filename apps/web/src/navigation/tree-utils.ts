import type { TreeDocumentNode, TreeFolderNode, TreeNode } from '@leandocs/shared';

export interface VisibleRow {
  node: TreeNode;
  /** 1 for children of the root (aria-level). */
  level: number;
}

/** Rows currently visible in the tree, in display order (folders collapsed unless expanded). */
export function flattenVisible(root: TreeFolderNode, expanded: ReadonlySet<string>): VisibleRow[] {
  const rows: VisibleRow[] = [];
  const walk = (folder: TreeFolderNode, level: number) => {
    for (const child of folder.children) {
      rows.push({ node: child, level });
      if (child.type === 'folder' && expanded.has(child.path)) walk(child, level + 1);
    }
  };
  walk(root, 1);
  return rows;
}

/** "A/B/C.md" → ["A", "A/B"]; "A/B" (folder) → ["A"] */
export function ancestorFolders(path: string): string[] {
  const parts = path.split('/');
  parts.pop();
  return parts.map((_, index) => parts.slice(0, index + 1).join('/'));
}

/** All folder paths, depth-first, including the root (""). */
export function collectFolders(root: TreeFolderNode): string[] {
  const result: string[] = [];
  const walk = (folder: TreeFolderNode) => {
    result.push(folder.path);
    for (const child of folder.children) if (child.type === 'folder') walk(child);
  };
  walk(root);
  return result;
}

export function findDocument(root: TreeFolderNode, id: string): TreeDocumentNode | undefined {
  for (const child of root.children) {
    if (child.type === 'document' && child.id === id) return child;
    if (child.type === 'folder') {
      const found = findDocument(child, id);
      if (found) return found;
    }
  }
  return undefined;
}

export function countDocuments(folder: TreeFolderNode): number {
  return folder.children.reduce(
    (sum, child) => sum + (child.type === 'document' ? 1 : countDocuments(child)),
    0,
  );
}

/** True when `candidate` is `folder` itself or inside it. */
export function isSameOrInside(candidate: string, folder: string): boolean {
  return candidate === folder || candidate.startsWith(`${folder}/`);
}
