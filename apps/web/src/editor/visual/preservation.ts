import type { Root, RootContent, Node as AstNode } from 'mdast';
import { isEditableCallout, type DirectiveNode } from './blocks';

export interface PreservedBlock extends AstNode {
  type: 'preservedBlock';
  value: string;
}
declare module 'mdast' {
  interface RootContentMap {
    preservedBlock: PreservedBlock;
  }
}

function needsPreservation(node: AstNode): boolean {
  // Known callouts are edited visually as long as their content is (P6-10).
  if (isEditableCallout(node))
    return (node as unknown as DirectiveNode).children.some(
      (child, index) =>
        !(
          index === 0 && (child.data as { directiveLabel?: boolean } | undefined)?.directiveLabel
        ) && needsPreservation(child as unknown as AstNode),
    );
  if (
    [
      'html',
      'definition',
      'linkReference',
      'imageReference',
      'footnoteDefinition',
      'footnoteReference',
      'containerDirective',
      'leafDirective',
      'textDirective',
      'yaml',
    ].includes(node.type)
  )
    return true;
  if ('children' in node && Array.isArray(node.children))
    return (node.children as AstNode[]).some(needsPreservation);
  return false;
}

/** Preserve an entire enclosing block: inline HTML/directives must keep their context too. */
export function preserveBlocks(tree: Root, source: string): string[] {
  const originals: string[] = [];
  tree.children = tree.children.map((node): RootContent => {
    const from = node.position?.start.offset;
    const to = node.position?.end.offset;
    const raw = from === undefined || to === undefined ? '' : source.slice(from, to);
    originals.push(raw);
    if (!needsPreservation(node)) return node;
    return { type: 'preservedBlock', value: raw, position: node.position };
  });
  return originals;
}

/** URLs are inert in opaque blocks; normal editor links/images must be safe as DOM attributes. */
export function safeEditorUrl(value: string): string {
  const normal = Array.from(value)
    .filter((character) => character.charCodeAt(0) > 32 && character.charCodeAt(0) !== 127)
    .join('');
  if (/^[a-z][a-z\d+.-]*:/i.test(normal) && !/^(https?|mailto):/i.test(normal)) return '';
  return value;
}
