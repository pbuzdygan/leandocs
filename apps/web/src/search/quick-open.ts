import type { TreeDocumentNode, TreeFolderNode } from '@leandocs/shared';

export interface QuickOpenItem {
  id: string;
  title: string;
  path: string;
}

/** Every document in the tree, in tree order. */
export function allDocuments(root: TreeFolderNode): QuickOpenItem[] {
  const items: QuickOpenItem[] = [];
  const walk = (folder: TreeFolderNode) => {
    for (const child of folder.children) {
      if (child.type === 'folder') walk(child);
      else items.push(toItem(child));
    }
  };
  walk(root);
  return items;
}

function toItem(node: TreeDocumentNode): QuickOpenItem {
  return { id: node.id, title: node.title, path: node.path };
}

function fold(text: string): string {
  return text.replace(/[łŁ]/g, 'l').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/**
 * Score of `query` as an in-order subsequence of `text` (lower is better), or undefined when it
 * does not match. Contiguous runs and matches at word starts score best, like an editor's
 * quick open.
 */
function subsequenceScore(query: string, text: string): number | undefined {
  let score = 0;
  let position = 0;
  let previous = -2;
  for (const character of query) {
    if (character === ' ') continue;
    const found = text.indexOf(character, position);
    if (found === -1) return undefined;
    const wordStart = found === 0 || /[\s/_\-.]/.test(text[found - 1] ?? '');
    score += found === previous + 1 ? 0 : wordStart ? 1 : 3 + Math.min(found - position, 10);
    previous = found;
    position = found + 1;
  }
  return score;
}

/** Quick open (UI_SPEC §63): match the title first, then the path; best matches first. */
export function quickOpen(items: QuickOpenItem[], query: string, limit = 20): QuickOpenItem[] {
  const q = fold(query.trim());
  if (!q) return items.slice(0, limit);
  const scored: { item: QuickOpenItem; score: number }[] = [];
  for (const item of items) {
    const title = fold(item.title);
    const titleScore = title.startsWith(q) ? -2 : subsequenceScore(q, title);
    const pathScore = subsequenceScore(q, fold(item.path));
    const score =
      titleScore !== undefined ? titleScore : pathScore !== undefined ? pathScore + 20 : undefined;
    if (score !== undefined) scored.push({ item, score });
  }
  return scored
    .sort((a, b) => a.score - b.score || a.item.title.localeCompare(b.item.title))
    .slice(0, limit)
    .map((entry) => entry.item);
}
