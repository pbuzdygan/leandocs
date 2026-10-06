import type { Element, Root as HastRoot } from 'hast';
import GithubSlugger from 'github-slugger';
import { toString as hastToString } from 'hast-util-to-string';
import dockerfile from 'highlight.js/lib/languages/dockerfile';
import nginx from 'highlight.js/lib/languages/nginx';
import powershell from 'highlight.js/lib/languages/powershell';
import { common } from 'lowlight';
import { parseMarkdown } from '@leandocs/shared';
import rehypeHighlight from 'rehype-highlight';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';
import { visit } from 'unist-util-visit';
import { applyRenderContext, type RenderContext } from './links';
import { sanitizeSchema } from './schema';

export interface TocHeading {
  id: string;
  depth: number;
  text: string;
}

export interface RenderedMarkdown {
  tree: HastRoot;
  headings: TocHeading[];
}

export const highlightLanguages = { ...common, dockerfile, nginx, powershell };

const HEADING = /^h([1-6])$/;

/**
 * Heading ids are added *after* sanitisation by our own code (not taken from user HTML), so they
 * stay readable (`#hardware`). Slugs that would shadow an existing `window` property get a prefix.
 */
function rehypeHeadingIds(headings: TocHeading[]) {
  return (tree: HastRoot) => {
    const slugger = new GithubSlugger();
    visit(tree, 'element', (node: Element) => {
      const match = HEADING.exec(node.tagName);
      if (!match) return;
      const text = hastToString(node).trim();
      let id = slugger.slug(text) || `section-${headings.length + 1}`;
      if (typeof window !== 'undefined' && id in window) id = `section-${id}`;
      node.properties = { ...node.properties, id };
      headings.push({ id, depth: Number(match[1]), text });
    });
  };
}

/**
 * Sanitisation prefixes ids from raw HTML and footnotes with `user-content-`; point same-page
 * links (`#fn-1`) at the prefixed id when only that one exists.
 */
function rehypeFixFragments() {
  return (tree: HastRoot) => {
    const ids = new Set<string>();
    visit(tree, 'element', (node: Element) => {
      if (typeof node.properties.id === 'string') ids.add(node.properties.id);
    });
    visit(tree, 'element', (node: Element) => {
      const href = node.properties.href;
      if (node.tagName !== 'a' || typeof href !== 'string' || !href.startsWith('#')) return;
      const target = decodeURIComponent(href.slice(1));
      if (!ids.has(target) && ids.has(`user-content-${target}`)) {
        node.properties.href = `#user-content-${target}`;
      }
    });
  };
}

/**
 * Markdown → safe HTML tree (PROJECT_SPEC §65):
 * parse (shared) → render context → hast (raw HTML kept) → raw → **sanitize** → highlight →
 * heading ids. Nothing after sanitisation copies user-controlled markup.
 */
export function renderMarkdown(markdown: string, context: RenderContext): RenderedMarkdown {
  const mdast = parseMarkdown(markdown);
  applyRenderContext(mdast, context);
  const headings: TocHeading[] = [];
  const processor = unified()
    .use(remarkRehype, { allowDangerousHtml: true, clobberPrefix: '' })
    .use(rehypeRaw)
    .use(rehypeSanitize, sanitizeSchema)
    .use(rehypeHighlight, {
      detect: false,
      languages: highlightLanguages,
      plainText: ['mermaid', 'text', 'txt', 'plain'],
    })
    .use(rehypeHeadingIds, headings)
    .use(rehypeFixFragments);
  const tree = processor.runSync(mdast) as HastRoot;
  return { tree, headings };
}
