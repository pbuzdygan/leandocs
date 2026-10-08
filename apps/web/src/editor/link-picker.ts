import { createLinkResolver, linkKey, type LinkableDocument } from '@leandocs/shared';
import { quickOpen } from '../search/quick-open';

/**
 * Document suggestions after `[[` (PROJECT_SPEC §23): title, aliases, file name and path, best
 * matches first. Shared by the visual and the source editor.
 */
export function linkCandidates(
  all: readonly LinkableDocument[],
  query: string,
  limit = 8,
  /** The document being edited: a link to itself is rarely wanted, so it is not suggested. */
  excludeId?: string,
): LinkableDocument[] {
  const documents = excludeId ? all.filter((document) => document.id !== excludeId) : all;
  const byId = new Map(documents.map((document) => [document.id, document]));
  const q = linkKey(query);
  // An alias that starts with the query counts like a title match.
  const aliasHits = q
    ? documents.filter((document) =>
        document.aliases?.some((alias) => linkKey(alias).startsWith(q)),
      )
    : [];
  const fuzzy = quickOpen([...documents], query, limit).map((item) => byId.get(item.id)!);
  const seen = new Set<string>();
  return [...fuzzy, ...aliasHits]
    .filter((document) => !seen.has(document.id) && seen.add(document.id))
    .slice(0, limit);
}

/**
 * What to write inside `[[…]]` for `document`: its title when that resolves to it, otherwise
 * its path without `.md` (titles can be shared by several documents).
 */
export function wikiTargetFor(
  document: LinkableDocument,
  documents: readonly LinkableDocument[],
): string {
  const resolver = createLinkResolver(documents);
  return resolver.wiki(document.title)?.id === document.id
    ? document.title
    : document.path.replace(/\.md$/i, '');
}
