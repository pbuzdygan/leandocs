import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  createLinkResolver,
  encodePathSegment,
  folderOf,
  isExternalHref,
  linkKey,
  parseMarkdown,
  relativePath,
  resolveRelativePath,
  type LinkableDocument,
} from '@leandocs/shared';
import { atomicWriteFile } from '../filesystem/atomic-write.js';
import { parseFile } from './frontmatter.js';
import type { DocumentRegistry, RegistryLogger } from './registry.js';

/**
 * Keeps links working when documents or folders move (PROJECT_SPEC §26, P9-05).
 *
 * A move is described as path mappings: a document (`A/Old.md → B/New.md`), its attachments
 * folder (`A/Old.assets/ → B/New.assets/`, a prefix) or a whole folder (`A/ → C/A/`, a prefix).
 *
 * - Relative Markdown destinations (links, images, reference definitions) are re-pointed in the
 *   documents that link to a moved path, and rebased in the moved documents themselves, so
 *   `../Network/UniFi.md` and `Doc.assets/a.png` keep reaching the same file.
 * - Wiki links resolve by title/alias and normally stay as they are; one is only rewritten when it
 *   used a file name or path and would otherwise stop reaching the same document.
 * - Only the destination text changes. Prose, code, raw HTML and front matter stay byte for byte.
 *   Links that were already broken are left alone.
 */

export interface PathMove {
  from: string;
  to: string;
  /** Prefix mapping for folders (`from`/`to` end with `/`). */
  prefix: boolean;
}

/** The new location of `relative` after `moves`, or undefined when it did not move. */
export function mapPath(relative: string, moves: readonly PathMove[]): string | undefined {
  const lower = relative.toLowerCase();
  for (const move of moves) {
    const from = move.from.toLowerCase();
    if (!move.prefix && lower === from) return move.to;
    if (move.prefix && lower.startsWith(from)) return move.to + relative.slice(move.from.length);
  }
  return undefined;
}

/** Moves for a document and its `.assets` folder. */
export function documentMoves(from: string, to: string): PathMove[] {
  const assets = (file: string) => `${file.replace(/\.md$/i, '')}.assets/`;
  return [
    { from, to, prefix: false },
    { from: assets(from), to: assets(to), prefix: true },
  ];
}

interface AstNode {
  type: string;
  url?: string;
  position?: { start: { offset?: number }; end: { offset?: number } };
  children?: AstNode[];
}

interface Edit {
  from: number;
  to: number;
  text: string;
}

function applyEdits(source: string, edits: Edit[]): string {
  for (const edit of edits.sort((a, b) => b.from - a.from))
    source = source.slice(0, edit.from) + edit.text + source.slice(edit.to);
  return source;
}

/** Encodes a relative path the way the original destination was written. */
function formatHref(original: string, newPath: string, angled: boolean, fragment: string): string {
  const prefix = original.startsWith('./') && !newPath.startsWith('../') ? './' : '';
  const encoded = angled
    ? newPath
    : newPath
        .split('/')
        .map((segment) => (segment === '..' ? segment : encodePathSegment(segment)))
        .join('/');
  return `${prefix}${encoded}${fragment}`;
}

/**
 * Rewrites relative Markdown destinations in `body` of a document that moved from `oldSource` to
 * `newSource` (the same path when only its targets moved). `exists` says whether an unmoved
 * target exists, so already-broken links are not touched.
 */
export function rewriteRelativeLinks(
  body: string,
  oldSource: string,
  newSource: string,
  moves: readonly PathMove[],
  exists: (relative: string) => boolean,
): string {
  const edits: Edit[] = [];
  const sourceMoved = oldSource !== newSource;
  const walk = (node: AstNode) => {
    if (
      (node.type === 'link' || node.type === 'image' || node.type === 'definition') &&
      node.url &&
      !isExternalHref(node.url) &&
      node.position
    ) {
      const url = node.url;
      const hash = url.indexOf('#');
      const rawPath = hash === -1 ? url : url.slice(0, hash);
      const fragment = hash === -1 ? '' : url.slice(hash);
      let decoded: string | undefined;
      try {
        decoded = decodeURIComponent(rawPath);
      } catch {
        decoded = undefined;
      }
      const resolved = decoded ? resolveRelativePath(folderOf(oldSource), decoded) : undefined;
      const mapped = resolved === undefined ? undefined : mapPath(resolved, moves);
      const from = node.position.start.offset;
      const to = node.position.end.offset;
      if (
        resolved !== undefined &&
        rawPath !== '' &&
        (mapped !== undefined || (sourceMoved && exists(resolved))) &&
        from !== undefined &&
        to !== undefined
      ) {
        const fragmentText = body.slice(from, to);
        const delimiter =
          node.type === 'definition'
            ? fragmentText.indexOf(']:') + 2
            : fragmentText.lastIndexOf('](') + 2;
        const index = fragmentText.indexOf(url, delimiter);
        if (delimiter >= 2 && index >= 0) {
          const angled = fragmentText[index - 1] === '<';
          const next = formatHref(
            url,
            relativePath(newSource, mapped ?? resolved),
            angled,
            fragment,
          );
          if (next !== url)
            edits.push({ from: from + index, to: from + index + url.length, text: next });
        }
      }
    }
    node.children?.forEach(walk);
  };
  walk(parseMarkdown(body) as unknown as AstNode);
  return applyEdits(body, edits);
}

const WIKI_LINK = /\[\[([^[\]|#\n]+)((?:#[^[\]|\n]+)?(?:\|[^[\]\n]+)?)\]\]/g;

/** Source ranges where `[[…]]` is literal text (code and raw HTML). */
function literalRanges(body: string): [number, number][] {
  const ranges: [number, number][] = [];
  const walk = (node: AstNode) => {
    if (['code', 'inlineCode', 'html'].includes(node.type) && node.position) {
      const { start, end } = node.position;
      if (start.offset !== undefined && end.offset !== undefined)
        ranges.push([start.offset, end.offset]);
      return;
    }
    node.children?.forEach(walk);
  };
  walk(parseMarkdown(body) as unknown as AstNode);
  return ranges;
}

/**
 * Rewrites wiki targets that would stop resolving to the same document after the move (they
 * named the old file or path). `oldResolver`/`newResolver` see the documents before/after.
 */
export function rewriteWikiTargets(
  body: string,
  oldResolver: ReturnType<typeof createLinkResolver<LinkableDocument>>,
  newResolver: ReturnType<typeof createLinkResolver<LinkableDocument>>,
  after: (id: string) => LinkableDocument | undefined,
): string {
  const literal = literalRanges(body);
  return body.replace(WIKI_LINK, (whole, target: string, rest: string, offset: number) => {
    if (literal.some(([from, to]) => offset >= from && offset < to)) return whole;
    const before = oldResolver.wiki(target);
    if (!before || newResolver.wiki(target)?.id === before.id) return whole;
    const document = after(before.id);
    if (!document) return whole;
    const withoutExtension = document.path.replace(/\.md$/i, '');
    const candidates = target.includes('/')
      ? [/\.md$/i.test(target.trim()) ? document.path : withoutExtension]
      : [document.title, path.posix.basename(withoutExtension), withoutExtension];
    const replacement = candidates.find(
      (candidate) => newResolver.wiki(candidate)?.id === before.id,
    );
    return replacement ? `[[${replacement}${rest}]]` : whole;
  });
}

export class LinkUpdater {
  constructor(
    private readonly contentDir: string,
    private readonly registry: DocumentRegistry,
    private readonly logger: RegistryLogger,
  ) {}

  /**
   * Call **before** moving: collects the documents to update (link sources found in the index
   * plus the moved documents) and a snapshot of the document set. Returns a function that applies
   * the rewrite after the move and resolves to the updated paths.
   */
  prepare(
    moves: readonly PathMove[],
    retitle?: { id: string; title: string },
  ): () => Promise<string[]> {
    const entries = this.registry.list();
    const exact: string[] = [];
    const retitled = retitle && entries.find((entry) => entry.id === retitle.id);
    if (retitled) exact.push(linkKey(retitled.title));
    const prefixes: string[] = [];
    for (const move of moves) {
      if (move.prefix) prefixes.push(linkKey(move.from));
      else {
        exact.push(linkKey(move.from), linkKey(move.from.replace(/\.md$/i, '')));
        exact.push(linkKey(path.posix.basename(move.from).replace(/\.md$/i, '')));
      }
    }
    const sources = new Set<string>();
    for (const { sourcePath } of this.registry.store.links({
      lookups: exact,
      lookupPrefixes: prefixes,
    }))
      sources.add(sourcePath);
    for (const entry of entries)
      if (mapPath(entry.path, moves) !== undefined) sources.add(entry.path);

    const before: LinkableDocument[] = entries.map((entry) => ({
      id: entry.id,
      title: entry.title,
      path: entry.path,
      aliases: entry.aliases,
    }));
    const after = before.map((document) => ({
      ...document,
      path: mapPath(document.path, moves) ?? document.path,
      title: document.id === retitle?.id ? retitle.title : document.title,
    }));
    const oldResolver = createLinkResolver(before);
    const newResolver = createLinkResolver(after);
    const byId = new Map(after.map((document) => [document.id, document]));

    return async () => {
      const updated: string[] = [];
      for (const oldSource of sources) {
        const newSource = mapPath(oldSource, moves) ?? oldSource;
        const absolute = path.join(this.contentDir, newSource);
        try {
          const current = await readFile(absolute, 'utf8');
          const { body } = parseFile(current);
          let next = rewriteRelativeLinks(body, oldSource, newSource, moves, (relative) =>
            existsSync(path.join(this.contentDir, relative)),
          );
          next = rewriteWikiTargets(next, oldResolver, newResolver, (id) => byId.get(id));
          if (next === body) continue;
          await atomicWriteFile(absolute, current.slice(0, current.length - body.length) + next);
          updated.push(newSource);
        } catch (error) {
          // The move itself succeeded; a document we could not update keeps its old links.
          this.logger.warn({ path: newSource, err: error }, 'Could not update links after a move');
        }
      }
      if (updated.length > 0)
        this.logger.info({ documents: updated }, 'Updated links after a move');
      return updated;
    };
  }
}
