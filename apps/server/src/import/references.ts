import { folderOf, isExternalHref, parseMarkdown, resolveRelativePath } from '@leandocs/shared';
import { literalRanges } from '../documents/link-updater.js';

interface AstNode {
  type: string;
  url?: string;
  data?: { wikiLink?: unknown };
  children?: AstNode[];
}

/**
 * Local files a Markdown body refers to through links, images and reference definitions, as
 * paths inside the selection (resolved from the folder of `documentPath`). Wiki links resolve by
 * title, not by path, and external or absolute destinations are not local files.
 */
export function localReferences(body: string, documentPath: string): string[] {
  const found = new Set<string>();
  const walk = (node: AstNode) => {
    if (
      (node.type === 'link' || node.type === 'image' || node.type === 'definition') &&
      !node.data?.wikiLink &&
      node.url &&
      !isExternalHref(node.url)
    ) {
      const hash = node.url.indexOf('#');
      // Same resolution as rewriteRelativeLinks, so every reference found can be re-pointed.
      const rawPath = hash === -1 ? node.url : node.url.slice(0, hash);
      try {
        const resolved = rawPath
          ? resolveRelativePath(folderOf(documentPath), decodeURIComponent(rawPath))
          : undefined;
        if (resolved) found.add(resolved);
      } catch {
        // A malformed escape is not a usable file reference.
      }
    }
    node.children?.forEach(walk);
  };
  walk(parseMarkdown(body) as unknown as AstNode);
  return [...found];
}

/**
 * Obsidian-style references to files (PROJECT_SPEC §70): `![[image.png]]`, `![[image.png|300]]`,
 * `![[Note]]` and `[[manual.pdf|Manual]]`. Ordinary wiki links to notes (`[[Note]]`,
 * `[[Note#Heading|label]]`) are not listed: LeanDocs resolves them as they are. Code and raw
 * HTML are skipped, so examples in code blocks stay literal.
 */
export interface WikiFileReference {
  /** Source range of the whole `![[…]]` / `[[…]]`. */
  from: number;
  to: number;
  embed: boolean;
  /** Note embed (`![[Note]]`): no file extension, or `.md`. */
  note: boolean;
  target: string;
  /** The part after `#` (heading, block or PDF page), without `#`. */
  fragment?: string;
  /** The part after `|`: a label, or an image size such as `300` or `300x200`. */
  alias?: string;
}

const WIKI = /(!?)\[\[([^[\]|#\n]+)(?:#([^[\]|\n]*))?(?:\|([^[\]\n]*))?\]\]/g;

export function wikiFileReferences(body: string): WikiFileReference[] {
  // Parsed only for a candidate: most notes have no file references (P15-07).
  let literal: [number, number][] | undefined;
  const references: WikiFileReference[] = [];
  for (const match of body.matchAll(WIKI)) {
    const from = match.index;
    const embed = match[1] === '!';
    const target = match[2]!.trim();
    const extension = /\.([a-z0-9]+)$/i.exec(target)?.[1]?.toLowerCase();
    const note = extension === undefined || extension === 'md';
    if (note && !embed) continue;
    literal ??= literalRanges(body);
    if (literal.some(([start, end]) => from >= start && from < end)) continue;
    const reference: WikiFileReference = { from, to: from + match[0].length, embed, note, target };
    if (match[3]?.trim()) reference.fragment = match[3].trim();
    if (match[4]?.trim()) reference.alias = match[4].trim();
    references.push(reference);
  }
  return references;
}

/**
 * Finds the file a wiki reference names the way Obsidian does: by vault path or by file name
 * anywhere in the selection. With several matches, the one closest to the note wins (same
 * folder, then the longest shared folder path, then the shortest path); `ambiguous` reports it.
 */
export function findByName(
  target: string,
  documentPath: string,
  paths: readonly string[],
): { path: string; ambiguous: boolean } | undefined {
  const wanted = target.replace(/^\.?\//, '').toLowerCase();
  const matches = paths.filter((candidate) => {
    const lower = candidate.toLowerCase();
    return lower === wanted || lower.endsWith(`/${wanted}`);
  });
  if (matches.length === 0) return undefined;
  const folder = folderOf(documentPath).split('/').filter(Boolean);
  const shared = (candidate: string) => {
    const segments = folderOf(candidate).split('/');
    let count = 0;
    while (count < folder.length && segments[count] === folder[count]) count++;
    return count;
  };
  const [best] = [...matches].sort(
    (a, b) => shared(b) - shared(a) || a.length - b.length || (a < b ? -1 : a > b ? 1 : 0),
  );
  return { path: best!, ambiguous: matches.length > 1 };
}
