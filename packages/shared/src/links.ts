import type { Root } from 'mdast';
import { visit } from 'unist-util-visit';

/**
 * Links between documents (PROJECT_SPEC §22–26), shared by the server indexer and the web
 * renderer so both resolve a link to the same document.
 */

/** A document as far as link resolution is concerned. */
export interface LinkableDocument {
  id: string;
  title: string;
  path: string;
  aliases?: readonly string[];
}

export type ExtractedLink =
  | {
      kind: 'wiki';
      /** `Target` in `[[Target#Heading|Label]]`. */
      target: string;
      heading?: string;
      alias?: string;
    }
  | {
      kind: 'markdown';
      /** The destination as written (`../Network/UniFi.md#vlans`). */
      href: string;
      /** Percent-decoded path part, without the fragment. */
      path: string;
      fragment?: string;
    };

/** True for destinations that are not relative paths (`https:`, `mailto:`, `/abs`, `#frag`). */
export function isExternalHref(href: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('/') || href.startsWith('#');
}

/** Splits and decodes a relative `.md` destination; undefined for anything else. */
export function parseMarkdownHref(href: string): { path: string; fragment?: string } | undefined {
  if (isExternalHref(href)) return undefined;
  const hash = href.indexOf('#');
  const rawPath = hash === -1 ? href : href.slice(0, hash);
  let path: string;
  try {
    path = decodeURIComponent(rawPath);
  } catch {
    return undefined;
  }
  if (!/\.md$/i.test(path)) return undefined;
  const fragment = hash === -1 ? undefined : href.slice(hash + 1);
  return fragment ? { path, fragment } : { path };
}

/**
 * Document links in a parsed tree (P9-01): wiki links (from `parseMarkdown`) and relative
 * Markdown links/definitions to `.md` files. Images, external URLs and in-page anchors are not
 * document links.
 */
export function extractLinks(tree: Root): ExtractedLink[] {
  const links: ExtractedLink[] = [];
  visit(tree, (node) => {
    if (node.type === 'link' && node.data?.wikiLink) {
      const { target, heading, alias } = node.data.wikiLink;
      const link: ExtractedLink = { kind: 'wiki', target };
      if (heading) link.heading = heading;
      if (alias) link.alias = alias;
      links.push(link);
    } else if (node.type === 'link' || node.type === 'definition') {
      const parsed = parseMarkdownHref(node.url);
      if (parsed) links.push({ kind: 'markdown', href: node.url, ...parsed });
    }
  });
  return links;
}

/** Folder part of a document path (`a/b/c.md` → `a/b`, `c.md` → ``). */
export function folderOf(documentPath: string): string {
  const slash = documentPath.lastIndexOf('/');
  return slash === -1 ? '' : documentPath.slice(0, slash);
}

/** Normalises `a/b/../c`; returns undefined when the path escapes the content root. */
export function resolveRelativePath(fromFolder: string, href: string): string | undefined {
  const parts = fromFolder === '' ? [] : fromFolder.split('/');
  for (const segment of href.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      if (parts.length === 0) return undefined;
      parts.pop();
    } else parts.push(segment);
  }
  return parts.join('/');
}

/** Relative path from the folder of `fromDocument` to `toPath` (`../Network/UniFi.md`). */
export function relativePath(fromDocument: string, toPath: string): string {
  const from = folderOf(fromDocument).split('/').filter(Boolean);
  const to = toPath.split('/');
  let common = 0;
  while (common < from.length && common < to.length - 1 && from[common] === to[common]) common++;
  return [...from.slice(common).map(() => '..'), ...to.slice(common)].join('/');
}

/** Case-insensitive lookup key used for titles, aliases, file names and paths. */
export function linkKey(text: string): string {
  return text.normalize('NFC').trim().toLowerCase();
}

function stemOf(path: string): string {
  return (path.split('/').pop() ?? path).replace(/\.md$/i, '');
}

/**
 * Resolves links against the document set (P9-02). Wiki targets match, in order: title, alias,
 * file name, then path (with or without `.md`); all case-insensitive. Within one kind the first
 * document in path order wins, so results are stable.
 */
export function createLinkResolver<T extends LinkableDocument>(documents: readonly T[]) {
  const sorted = [...documents].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const byTitle = new Map<string, T>();
  const byAlias = new Map<string, T>();
  const byStem = new Map<string, T>();
  const byPath = new Map<string, T>();
  const add = (map: Map<string, T>, key: string, document: T) => {
    if (key && !map.has(key)) map.set(key, document);
  };
  for (const document of sorted) {
    add(byTitle, linkKey(document.title), document);
    for (const alias of document.aliases ?? []) add(byAlias, linkKey(alias), document);
    add(byStem, linkKey(stemOf(document.path)), document);
    add(byPath, linkKey(document.path), document);
  }
  const wiki = (target: string): T | undefined => {
    const key = linkKey(target);
    return (
      byTitle.get(key) ??
      byAlias.get(key) ??
      byStem.get(key) ??
      byPath.get(key.endsWith('.md') ? key : `${key}.md`)
    );
  };
  const path = (documentPath: string): T | undefined => byPath.get(linkKey(documentPath));
  return {
    wiki,
    path,
    /** Resolves an extracted link written in `fromDocument`. */
    resolve(link: ExtractedLink, fromDocument: string): T | undefined {
      if (link.kind === 'wiki') return wiki(link.target);
      const resolved = resolveRelativePath(folderOf(fromDocument), link.path);
      return resolved === undefined ? undefined : path(resolved);
    },
  };
}

/** The lookup keys under which a wiki link could reach `document` (for backlink queries). */
export function wikiKeys(document: LinkableDocument): string[] {
  const keys = new Set<string>([
    linkKey(document.title),
    linkKey(stemOf(document.path)),
    linkKey(document.path),
    linkKey(document.path.replace(/\.md$/i, '')),
    ...(document.aliases ?? []).map(linkKey),
  ]);
  keys.delete('');
  return [...keys];
}

/* ---- API DTOs (PROJECT_SPEC §60: /documents/:id/links, /documents/:id/backlinks) ---- */

export interface LinkedDocument {
  id: string;
  title: string;
  path: string;
}

/** One distinct link target of a document; repeated links to the same target are counted. */
export interface OutgoingLink {
  kind: ExtractedLink['kind'];
  /** The target as written: wiki target, or the Markdown destination. */
  raw: string;
  /** The document it resolves to; `null` when the link is broken. */
  target: LinkedDocument | null;
  count: number;
}

export interface OutgoingLinksResponse {
  items: OutgoingLink[];
}

/** A document that links to the current one (PROJECT_SPEC §24). */
export interface Backlink extends LinkedDocument {
  count: number;
}

export interface BacklinksResponse {
  items: Backlink[];
}

/** A link that points to no document (PROJECT_SPEC §25). */
export interface BrokenLink {
  source: LinkedDocument;
  kind: ExtractedLink['kind'];
  raw: string;
}

export interface BrokenLinksResponse {
  items: BrokenLink[];
}
