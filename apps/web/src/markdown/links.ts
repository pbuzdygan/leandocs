import {
  createLinkResolver,
  encodePathSegment,
  parseMarkdownHref,
  resolveRelativePath,
  type LinkableDocument,
} from '@leandocs/shared';
import type { Link, Root } from 'mdast';
import GithubSlugger from 'github-slugger';
import { toString } from 'mdast-util-to-string';
import { visit } from 'unist-util-visit';

export type LinkTarget = LinkableDocument;

/** What the renderer needs to know about the surrounding documentation. */
export interface RenderContext {
  /** Path of the rendered document (relative links are resolved against its folder). */
  documentPath: string;
  /** Title shown in the header; a leading `# H1` with the same text is not rendered twice. */
  title?: string;
  /** All documents (from the tree) for resolving wiki links and relative `.md` links. */
  documents: LinkTarget[];
}

const BROKEN = {
  hName: 'span',
  hProperties: { className: ['broken-link'], title: 'Document not found' },
};

/** Re-exported for callers that resolve paths themselves; the logic lives in `@leandocs/shared`. */
export { resolveRelativePath };

function headingSlug(heading: string): string {
  return new GithubSlugger().slug(heading);
}

function documentUrl(id: string, fragment?: string): string {
  return `/doc/${encodeURIComponent(id)}${fragment ? `#${fragment}` : ''}`;
}

/** Resolve portable Markdown asset paths only; other URLs retain their existing policy. */
export function resolveAttachmentUrl(url: string, context: RenderContext): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(url) || /^[/#]/.test(url)) return url;
  let decoded: string;
  try {
    decoded = decodeURIComponent(url.split('#')[0]!);
  } catch {
    return url;
  }
  const folder = context.documentPath.includes('/')
    ? context.documentPath.slice(0, context.documentPath.lastIndexOf('/'))
    : '';
  const resolved = resolveRelativePath(folder, decoded);
  const match = resolved?.match(/^(.*)\.assets\/([^/]+)$/i);
  if (!match) return url;
  const target = context.documents.find((doc) => doc.path === `${match[1]}.md`);
  return target
    ? `/api/v1/documents/${encodeURIComponent(target.id)}/attachments/${encodePathSegment(match[2]!)}`
    : url;
}

/**
 * Applies the render context to the mdast tree:
 * - drops a leading `# H1` that repeats the document title (P4-09);
 * - resolves `[[wiki links]]` and relative `.md` links to `/doc/<id>` URLs;
 * - marks unresolved document links as broken (UI_SPEC §76).
 */
export function applyRenderContext(tree: Root, context: RenderContext): void {
  const first = tree.children[0];
  if (
    context.title &&
    first?.type === 'heading' &&
    first.depth === 1 &&
    toString(first).trim().toLowerCase() === context.title.trim().toLowerCase()
  ) {
    tree.children.shift();
  }

  // Same resolution as the server's link index (title, alias, file name, path; P9-02).
  const resolver = createLinkResolver(context.documents);
  const folder = context.documentPath.includes('/')
    ? context.documentPath.slice(0, context.documentPath.lastIndexOf('/'))
    : '';

  visit(tree, (node) => {
    if (node.type === 'image' || node.type === 'link' || node.type === 'definition')
      node.url = resolveAttachmentUrl(node.url, context);
  });

  visit(tree, 'link', (node: Link) => {
    const wiki = node.data?.wikiLink;
    if (wiki) {
      const target = resolver.wiki(wiki.target);
      if (target) node.url = documentUrl(target.id, wiki.heading && headingSlug(wiki.heading));
      else node.data = { ...node.data, ...BROKEN };
      return;
    }
    const parsed = parseMarkdownHref(node.url);
    if (!parsed) return;
    const resolved = resolveRelativePath(folder, parsed.path);
    const target = resolved === undefined ? undefined : resolver.path(resolved);
    if (target) node.url = documentUrl(target.id, parsed.fragment);
    else node.data = { ...node.data, ...BROKEN };
  });
}
