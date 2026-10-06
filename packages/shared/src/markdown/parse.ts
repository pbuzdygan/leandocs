import type { Link, Paragraph, PhrasingContent, Root, RootContent, Text } from 'mdast';
import type { ContainerDirective, LeafDirective, TextDirective } from 'mdast-util-directive';
// Type augmentation for `data.hName` / `data.hProperties` used by the HTML conversion.
import type {} from 'mdast-util-to-hast';
import { toString } from 'mdast-util-to-string';
import remarkDirective from 'remark-directive';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { SKIP, visit } from 'unist-util-visit';

/**
 * The LeanDocs Markdown profile (PROJECT_SPEC §16–22): CommonMark + GFM, callouts as container
 * directives (`:::warning`), and wiki links (`[[Title]]`, `[[Title#Heading]]`, `[[Title|label]]`).
 *
 * Runtime-agnostic: used by the web renderer now and by the server indexer later (Phase 8/9).
 */

export const CALLOUT_TYPES = ['note', 'info', 'tip', 'warning', 'danger'] as const;
export type CalloutType = (typeof CALLOUT_TYPES)[number];

export function isCalloutType(name: string): name is CalloutType {
  return (CALLOUT_TYPES as readonly string[]).includes(name);
}

/** Data attached to wiki-link `link` nodes (their `url` is empty until resolved). */
export interface WikiLinkData {
  target: string;
  heading?: string;
  alias?: string;
}

declare module 'mdast' {
  interface LinkData {
    wikiLink?: WikiLinkData;
  }
}

type AnyDirective = ContainerDirective | LeafDirective | TextDirective;

/** Parses Markdown (without front matter) into an mdast tree with LeanDocs extensions applied. */
export function parseMarkdown(markdown: string): Root {
  const processor = unified().use(remarkParse).use(remarkGfm).use(remarkDirective);
  const tree = processor.parse(markdown);
  processor.runSync(tree);
  applyCallouts(tree, markdown);
  applyWikiLinks(tree);
  return tree;
}

/**
 * Turns `:::note|info|tip|warning|danger` blocks into callouts. Every other directive syntax is
 * restored to its literal source text, so technical prose like `host:port` or `:latest` is
 * never swallowed by the directive parser.
 */
function applyCallouts(tree: Root, source: string): void {
  visit(tree, (node, index, parent) => {
    if (!isDirective(node) || parent === undefined || index === undefined) return;
    if (node.type === 'containerDirective' && isCalloutType(node.name)) {
      decorateCallout(node, node.name);
      return;
    }
    const literal = sliceSource(node, source);
    const text: Text = { type: 'text', value: literal };
    const replacement: RootContent =
      node.type === 'textDirective' ? text : ({ type: 'paragraph', children: [text] } as Paragraph);
    (parent.children as RootContent[]).splice(index, 1, replacement);
    return [SKIP, index + 1];
  });
}

function decorateCallout(node: ContainerDirective, type: CalloutType): void {
  const first = node.children[0];
  const hasLabel = first?.type === 'paragraph' && first.data?.directiveLabel === true;
  const title: Paragraph = hasLabel
    ? (first as Paragraph)
    : {
        type: 'paragraph',
        children: [{ type: 'text', value: type.charAt(0).toUpperCase() + type.slice(1) }],
      };
  title.data = { ...title.data, hProperties: { className: ['callout__title'] } };
  if (!hasLabel) node.children.unshift(title);
  node.data = {
    ...node.data,
    hName: 'div',
    hProperties: { className: ['callout', `callout--${type}`], dataCallout: type },
  };
}

function isDirective(node: { type: string }): node is AnyDirective {
  return (
    node.type === 'containerDirective' ||
    node.type === 'leafDirective' ||
    node.type === 'textDirective'
  );
}

function sliceSource(node: AnyDirective, source: string): string {
  const start = node.position?.start.offset;
  const end = node.position?.end.offset;
  if (start === undefined || end === undefined) return `:${node.name}`;
  return source.slice(start, end);
}

const WIKI_LINK = /\[\[([^[\]|#\n]+)(?:#([^[\]|\n]+))?(?:\|([^[\]\n]+))?\]\]/g;

/** `[[Target#Heading|Label]]` inside text becomes a `link` node with `data.wikiLink`. */
function applyWikiLinks(tree: Root): void {
  visit(tree, 'text', (node, index, parent) => {
    if (!parent || index === undefined || parent.type === 'link' || !node.value.includes('[[')) {
      return;
    }
    const parts: PhrasingContent[] = [];
    let last = 0;
    for (const match of node.value.matchAll(WIKI_LINK)) {
      const [whole, rawTarget = '', rawHeading, rawAlias] = match;
      if (match.index > last)
        parts.push({ type: 'text', value: node.value.slice(last, match.index) });
      const wikiLink: WikiLinkData = { target: rawTarget.trim() };
      if (rawHeading?.trim()) wikiLink.heading = rawHeading.trim();
      if (rawAlias?.trim()) wikiLink.alias = rawAlias.trim();
      const label =
        wikiLink.alias ??
        (wikiLink.heading ? `${wikiLink.target} › ${wikiLink.heading}` : wikiLink.target);
      const link: Link = {
        type: 'link',
        url: '',
        children: [{ type: 'text', value: label }],
        data: { wikiLink },
      };
      parts.push(link);
      last = match.index + whole.length;
    }
    if (parts.length === 0) return;
    if (last < node.value.length) parts.push({ type: 'text', value: node.value.slice(last) });
    (parent.children as PhrasingContent[]).splice(index, 1, ...parts);
    return [SKIP, index + parts.length];
  });
}

export interface HeadingInfo {
  depth: number;
  text: string;
}

/** Plain-text headings in document order (for search and link validation later). */
export function extractHeadings(tree: Root): HeadingInfo[] {
  const headings: HeadingInfo[] = [];
  visit(tree, 'heading', (node) => {
    headings.push({ depth: node.depth, text: toString(node) });
  });
  return headings;
}

// Blocks whose text is emitted as one unit; their children are not visited separately.
const TEXT_BLOCKS = new Set(['paragraph', 'tableCell', 'code', 'html']);

/**
 * Plain text of the document body for full-text search: one line per paragraph, table cell or
 * code block, so words from adjacent blocks never run together. Headings are left out (they are
 * indexed separately); raw HTML contributes its text only, never its tags. Text generated by the
 * parser (the default callout title) is not part of the document and is skipped.
 */
export function extractPlainText(tree: Root): string {
  const lines: string[] = [];
  visit(tree, (node) => {
    if (node.type === 'heading') return SKIP;
    if (!TEXT_BLOCKS.has(node.type)) return undefined;
    // Nodes without a source position are generated (e.g. the default callout title).
    if (!node.position) return SKIP;
    const text =
      node.type === 'code'
        ? node.value
        : node.type === 'html'
          ? node.value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')
          : toString(node, { includeHtml: false });
    if (text.trim()) lines.push(text.trim());
    return SKIP;
  });
  return lines.join('\n');
}
