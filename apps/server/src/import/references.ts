import { folderOf, isExternalHref, parseMarkdown, resolveRelativePath } from '@leandocs/shared';

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
