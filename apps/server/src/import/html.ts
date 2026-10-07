import type { Element, ElementContent, Root } from 'hast';
import { fromHtml } from 'hast-util-from-html';
import { toMdast } from 'hast-util-to-mdast';
import { gfmToMarkdown } from 'mdast-util-gfm';
import { toMarkdown } from 'mdast-util-to-markdown';
import { CONTINUE, SKIP, visit } from 'unist-util-visit';
import { MAX_IMPORT_DOCUMENT_BYTES } from '@leandocs/shared';
import { composeFile, setFrontmatterFields } from '../documents/frontmatter.js';
import { ASSETS_SUFFIX } from '../filesystem/file-name.js';
import {
  ImportItemError,
  type ConvertedDocument,
  type Importer,
  type ScannedDocument,
  type ScannedItem,
} from './importer.js';

const HTML_FILE = /\.html?$/i;
const LIMIT_MIB = MAX_IMPORT_DOCUMENT_BYTES / 1024 / 1024;

/** Removed without a trace in Markdown; each is reported (PROJECT_SPEC §68). */
const REMOVED: Record<string, string> = {
  script: 'script',
  noscript: 'script fallback',
  iframe: 'embedded page',
  frame: 'embedded page',
  object: 'embedded object',
  embed: 'embedded object',
  video: 'video',
  audio: 'audio',
  canvas: 'drawing',
  svg: 'vector drawing',
  math: 'formula',
  form: 'form',
  select: 'form field',
  textarea: 'form field',
  button: 'button',
};
/** Kept as plain text; only the formatting is lost. */
const FLATTENED: Record<string, string> = {
  u: 'underline',
  ins: 'underline',
  mark: 'highlight',
  sub: 'subscript',
  sup: 'superscript',
  small: 'small text',
  big: 'large text',
  font: 'font styling',
  center: 'centring',
  details: 'collapsible section',
};
const SAFE_URL = /^(?:https?:|mailto:|#|[^:]*$)/i;

/**
 * HTML files (PROJECT_SPEC §68): `.html` → HTML parser → Markdown, with a report of what could
 * not be converted safely. The HTML is only parsed, never rendered or executed. The result goes
 * through the normal Markdown pipeline (and its sanitising) like any other document.
 */
export const htmlImporter: Importer = {
  kind: 'html',

  reads(path) {
    return HTML_FILE.test(path);
  },

  detect(entries) {
    return entries.some((entry) => this.reads(entry.path));
  },

  scan(entries) {
    const items: ScannedItem[] = [];
    for (const entry of entries) {
      const segments = entry.path.split('/');
      const name = segments.at(-1)!;
      if (
        segments.some((segment) => segment.startsWith('.')) ||
        segments.slice(0, -1).some((segment) => segment.toLowerCase().endsWith(ASSETS_SUFFIX))
      )
        items.push({ kind: 'skipped', source: entry.path, reason: 'Hidden or attachment file' });
      else if (!this.reads(entry.path))
        items.push({
          kind: 'skipped',
          source: entry.path,
          reason: 'Only HTML files are converted',
        });
      else if (entry.tooLarge || !entry.bytes)
        items.push({ kind: 'skipped', source: entry.path, reason: `Larger than ${LIMIT_MIB} MiB` });
      else
        items.push({
          kind: 'document',
          source: entry.path,
          target: [...segments.slice(0, -1), name.replace(HTML_FILE, '.md')].join('/'),
          bytes: entry.bytes,
        });
    }
    return items.sort((a, b) => (a.source < b.source ? -1 : a.source > b.source ? 1 : 0));
  },

  convert(item: ScannedDocument): ConvertedDocument {
    const notes: string[] = [];
    const warnings: string[] = [];
    const { text, guessed } = decode(item.bytes);
    if (guessed)
      warnings.push(
        'The file does not declare its character encoding; it was read as Windows-1252, so check special characters',
      );
    const tree = fromHtml(text);
    const title = takeHead(tree);
    warnings.push(...simplify(tree, notes));
    const markdown = toMarkdown(toMdast(tree), {
      extensions: [gfmToMarkdown()],
      bullet: '-',
      rule: '-',
      fences: true,
      listItemIndent: 'one',
    });
    if (!title) return { text: markdown, notes, warnings, converted: true };
    return {
      text: composeFile({
        rawFrontmatter: setFrontmatterFields('', { title }),
        body: markdown,
        eol: '\n',
        bom: false,
        blankLineAfter: true,
      }),
      notes,
      warnings,
      converted: true,
    };
  },
};

/** Removes or rewrites what Markdown cannot represent safely; returns one warning per kind. */
function simplify(tree: Root, notes: string[]): string[] {
  const removed = new Map<string, number>();
  const flattened = new Set<string>();
  const images: string[] = [];
  let embeddedImages = 0;
  let unsafeLinks = 0;
  let mergedCells = false;
  let styled = false;
  let rewrittenLinks = 0;

  visit(tree, 'element', (node: Element, index, parent) => {
    const tag = node.tagName;
    if (typeof node.properties.style === 'string' && node.properties.style.trim() !== '')
      styled = true;
    const label =
      REMOVED[tag] ??
      (tag === 'input' && node.properties.type !== 'checkbox' ? 'form field' : undefined);
    if ((label || tag === 'style') && parent && index !== undefined) {
      if (label) removed.set(label, (removed.get(label) ?? 0) + 1);
      else styled = true;
      parent.children.splice(index, 1);
      return [SKIP, index];
    }
    if (FLATTENED[tag]) flattened.add(FLATTENED[tag]);
    if (
      (tag === 'td' || tag === 'th') &&
      (num(node.properties.colSpan) > 1 || num(node.properties.rowSpan) > 1)
    )
      mergedCells = true;
    if (tag === 'a' && typeof node.properties.href === 'string') {
      const href = node.properties.href.trim();
      if (!SAFE_URL.test(href)) {
        unsafeLinks++;
        node.tagName = 'span';
        node.properties = {};
      } else if (/^[^:?#]+\.html?(?:#.*)?$/i.test(href) && !href.startsWith('//')) {
        node.properties.href = href.replace(/\.html?(?=#|$)/i, '.md');
        rewrittenLinks++;
      }
    }
    if (tag === 'img' && parent && index !== undefined) {
      const src = typeof node.properties.src === 'string' ? node.properties.src.trim() : '';
      if (src.startsWith('data:') || !SAFE_URL.test(src)) {
        embeddedImages++;
        parent.children.splice(index, 1, ...altText(node));
        return [SKIP, index];
      }
      if (src !== '' && !/^https?:/i.test(src)) images.push(src);
    }
    return CONTINUE;
  });

  const warnings: string[] = [];
  for (const [label, count] of removed)
    warnings.push(
      `Removed ${count === 1 ? `a ${label}` : `${count} ${label}s`} that Markdown cannot contain`,
    );
  if (embeddedImages > 0)
    warnings.push(
      `Removed ${embeddedImages === 1 ? 'an image' : `${embeddedImages} images`} stored inside the HTML; only the description text was kept`,
    );
  if (images.length > 0)
    warnings.push(
      `Images are not imported yet; the document still refers to ${[...new Set(images)].slice(0, 3).join(', ')}${new Set(images).size > 3 ? ' …' : ''}`,
    );
  if (unsafeLinks > 0)
    warnings.push(
      `Removed ${unsafeLinks === 1 ? 'a link' : `${unsafeLinks} links`} that could run code; the link text was kept`,
    );
  if (mergedCells) warnings.push('A table with merged cells was simplified');
  if (flattened.size > 0)
    warnings.push(
      `Formatting Markdown does not support was removed: ${[...flattened].sort().join(', ')}`,
    );
  if (styled) warnings.push('Colours, fonts and other styles were removed');
  if (rewrittenLinks > 0)
    notes.push(
      `Links to ${rewrittenLinks === 1 ? 'an HTML page now point' : `${rewrittenLinks} HTML pages now point`} to the converted Markdown file`,
    );
  return warnings;
}

/** Removes `<head>` (scripts, styles and metadata are not content) and returns its `<title>`. */
function takeHead(tree: Root): string | undefined {
  let title: string | undefined;
  visit(tree, 'element', (node: Element, index, parent) => {
    if (node.tagName === 'title' && title === undefined)
      title = textOf(node).replace(/\s+/g, ' ').trim() || undefined;
    if (node.tagName !== 'head' || !parent || index === undefined) return CONTINUE;
    visit(node, 'element', (child: Element) => {
      if (child.tagName === 'title' && title === undefined)
        title = textOf(child).replace(/\s+/g, ' ').trim() || undefined;
    });
    parent.children.splice(index, 1);
    return [SKIP, index];
  });
  return title;
}

function altText(node: Element): ElementContent[] {
  const alt = typeof node.properties.alt === 'string' ? node.properties.alt.trim() : '';
  return alt ? [{ type: 'text', value: alt }] : [];
}

function textOf(node: Element): string {
  return node.children
    .map((child) =>
      child.type === 'text' ? child.value : child.type === 'element' ? textOf(child) : '',
    )
    .join('');
}

function num(value: unknown): number {
  return typeof value === 'number' ? value : Number(value ?? 1) || 1;
}

/**
 * HTML encoding sniffing, simplified from the HTML standard: byte order mark, then a `<meta>`
 * charset declaration in the first 1024 bytes, then UTF-8, then the Windows-1252 default.
 */
function decode(bytes: Buffer): { text: string; guessed: boolean } {
  const decodeAs = (label: string, fatal = false) =>
    new TextDecoder(label, { fatal }).decode(bytes);
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf)
    return { text: decodeAs('utf-8'), guessed: false };
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return { text: decodeAs('utf-16le'), guessed: false };
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return { text: decodeAs('utf-16be'), guessed: false };
  const head = bytes.subarray(0, 1024).toString('latin1');
  const declared = /<meta[^>]+charset\s*=\s*["']?\s*([\w.:-]+)/i.exec(head)?.[1];
  if (declared) {
    try {
      return { text: decodeAs(declared), guessed: false };
    } catch {
      throw new ImportItemError(`The character encoding "${declared}" is not supported`);
    }
  }
  try {
    return { text: decodeAs('utf-8', true), guessed: false };
  } catch {
    return { text: decodeAs('windows-1252'), guessed: true };
  }
}
