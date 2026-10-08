import { CALLOUT_TYPES, isCalloutType } from '@leandocs/shared';
import { codeBlockSchema, paragraphSchema } from '@milkdown/kit/preset/commonmark';
import { keymap } from '@milkdown/kit/prose/keymap';
import type { Node as ProseNode } from '@milkdown/kit/prose/model';
import { Plugin, PluginKey, TextSelection, type EditorState } from '@milkdown/kit/prose/state';
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view';
import { $nodeSchema, $prose } from '@milkdown/kit/utils';
import type { Element, ElementContent, Root as HastRoot } from 'hast';
import { createLowlight } from 'lowlight';
import { toString } from 'mdast-util-to-string';
import { highlightLanguages } from '../../markdown/pipeline';

/**
 * Code block languages offered in the editor (owner feedback 2026-10-02): the formats most common
 * in infrastructure documentation. Values are the Markdown fence names; all are highlighted in
 * View and Visual, except Mermaid (a diagram in View) and plain text.
 */
export const CODE_LANGUAGES: { value: string; label: string }[] = [
  { value: '', label: 'Plain text' },
  { value: 'bash', label: 'Bash / Shell' },
  { value: 'powershell', label: 'PowerShell' },
  { value: 'yaml', label: 'YAML' },
  { value: 'json', label: 'JSON' },
  { value: 'ini', label: 'INI / TOML' },
  { value: 'xml', label: 'HTML / XML' },
  { value: 'css', label: 'CSS' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'python', label: 'Python' },
  { value: 'go', label: 'Go' },
  { value: 'sql', label: 'SQL' },
  { value: 'dockerfile', label: 'Dockerfile' },
  { value: 'nginx', label: 'Nginx' },
  { value: 'diff', label: 'Diff' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'mermaid', label: 'Mermaid diagram' },
];

export const CALLOUT_LABELS: Record<string, string> = Object.fromEntries(
  CALLOUT_TYPES.map((type) => [type, type.charAt(0).toUpperCase() + type.slice(1)]),
);

/** The parts of an mdast container directive used here (remark-directive). */
export interface DirectiveNode {
  type: string;
  name: string;
  attributes?: Record<string, string | null | undefined> | null;
  children: { type: string; data?: unknown }[];
}

function isLabel(node: { type: string; data?: unknown } | undefined): boolean {
  return (
    node?.type === 'paragraph' &&
    (node.data as { directiveLabel?: boolean } | undefined)?.directiveLabel === true
  );
}

/**
 * A `:::note|info|tip|warning|danger` block that Visual can edit: a known callout type and no
 * `{attributes}` (those stay preserved, ADR-0007). The optional `[label]` becomes the title.
 */
export function isEditableCallout(node: { type: string }): boolean {
  if (node.type !== 'containerDirective') return false;
  const directive = node as DirectiveNode;
  return (
    isCalloutType(directive.name) &&
    Object.keys(directive.attributes ?? {}).length === 0 &&
    directive.children.length > (isLabel(directive.children[0]) ? 1 : 0)
  );
}

/** Editable callout (owner feedback 2026-10-02); previously an opaque, delete-on-type block. */
export const calloutSchema = $nodeSchema('callout', () => ({
  group: 'block',
  content: 'block+',
  defining: true,
  attrs: {
    kind: { default: 'note', validate: 'string' },
    title: { default: '', validate: 'string' },
  },
  parseDOM: [
    {
      tag: 'div[data-callout]',
      contentElement: 'div.callout__body',
      getAttrs: (dom) => ({
        kind: isCalloutType((dom as HTMLElement).dataset.callout ?? '')
          ? (dom as HTMLElement).dataset.callout
          : 'note',
        title: (dom as HTMLElement).dataset.title ?? '',
      }),
    },
  ],
  toDOM: (node) => {
    const kind = String(node.attrs.kind);
    const title = String(node.attrs.title);
    return [
      'div',
      { class: `callout callout--${kind}`, 'data-callout': kind, 'data-title': title },
      ['div', { class: 'callout__title', contenteditable: 'false' }, title || CALLOUT_LABELS[kind]],
      ['div', { class: 'callout__body' }, 0],
    ];
  },
  parseMarkdown: {
    match: (node) => isEditableCallout(node),
    runner: (state, node, type) => {
      const directive = node as unknown as DirectiveNode;
      const [first, ...rest] = directive.children;
      const label = isLabel(first);
      state
        .openNode(type, {
          kind: directive.name,
          title: label && first ? toString(first as never) : '',
        })
        .next((label ? rest : directive.children) as never)
        .closeNode();
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === 'callout',
    runner: (state, node) => {
      state.openNode('containerDirective', undefined, { name: String(node.attrs.kind) });
      if (node.attrs.title)
        state.addNode('paragraph', [{ type: 'text', value: String(node.attrs.title) }], undefined, {
          data: { directiveLabel: true },
        });
      state.next(node.content).closeNode();
    },
  },
}));

/** Code blocks show their language and use the View highlighting classes. */
export const codeBlockView = codeBlockSchema.extendSchema((previous) => (ctx) => ({
  ...previous(ctx),
  toDOM: (node) => {
    const language = String(node.attrs.language ?? '');
    return [
      'pre',
      {
        class: 'code-block visual-code',
        'data-language': language,
        'data-language-label':
          CODE_LANGUAGES.find((item) => item.value === language)?.label ?? language,
      },
      ['code', 0],
    ];
  },
}));

const lowlight = createLowlight(highlightLanguages);

function highlightDecorations(doc: ProseNode): DecorationSet {
  const decorations: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== 'code_block') return true;
    const language = String(node.attrs.language ?? '');
    if (!language || !lowlight.registered(language)) return false;
    let offset = pos + 1;
    const walk = (children: ElementContent[], classes: string[]) => {
      for (const child of children) {
        if (child.type === 'text') {
          if (classes.length > 0)
            decorations.push(
              Decoration.inline(offset, offset + child.value.length, { class: classes.join(' ') }),
            );
          offset += child.value.length;
        } else if (child.type === 'element') {
          const own = (child as Element).properties.className;
          walk(child.children, own ? [...classes, ...(own as string[])] : classes);
        }
      }
    };
    walk(
      (lowlight.highlight(language, node.textContent) as HastRoot).children as ElementContent[],
      [],
    );
    return false;
  });
  return DecorationSet.create(doc, decorations);
}

/** Syntax highlighting inside Visual code blocks (decorations only; the text is untouched). */
export const codeHighlight = $prose(() => {
  const key = new PluginKey<DecorationSet>('leandocs-code-highlight');
  return new Plugin({
    key,
    state: {
      init: (_, state) => highlightDecorations(state.doc),
      apply: (tr, value) => (tr.docChanged ? highlightDecorations(tr.doc) : value),
    },
    props: { decorations: (state) => key.getState(state) },
  });
});

/**
 * Leaving a code block without Mod-Enter (owner feedback 2026-10-02): Enter on an empty last line
 * (i.e. pressing Enter twice at the end) drops that empty line and continues below; ArrowDown on
 * the last line of a code block that ends its container adds a paragraph after it.
 */
export const codeBlockExit = $prose((ctx) => {
  const paragraphAfter = (state: EditorState, removeTrailingNewline: boolean) => {
    const { $from } = state.selection;
    let tr = state.tr;
    if (removeTrailingNewline) tr = tr.delete($from.pos - 1, $from.pos);
    const after = tr.mapping.map($from.after());
    tr = tr.insert(after, paragraphSchema.type(ctx).create());
    return tr.setSelection(TextSelection.create(tr.doc, after + 1)).scrollIntoView();
  };
  return keymap({
    Enter: (state, dispatch) => {
      const { $from, empty } = state.selection;
      if (!empty || $from.parent.type.name !== 'code_block') return false;
      const text = $from.parent.textContent;
      if ($from.parentOffset !== text.length || !text.endsWith('\n')) return false;
      dispatch?.(paragraphAfter(state, true));
      return true;
    },
    ArrowDown: (state, dispatch, view) => {
      const { $from, empty } = state.selection;
      if (!empty || $from.parent.type.name !== 'code_block') return false;
      const isLast = $from.index($from.depth - 1) === $from.node($from.depth - 1).childCount - 1;
      if (!isLast || (view && !view.endOfTextblock('down'))) return false;
      dispatch?.(paragraphAfter(state, false));
      return true;
    },
  });
});

/** What the caret is in, for the contextual toolbar (tables, code blocks, callouts). */
export interface BlockContext {
  table: { headerRow: boolean } | null;
  code: { pos: number; language: string } | null;
  callout: { pos: number; kind: string } | null;
  /** Text typed after `[[` before the caret (link picker, P9-06), or null. */
  wiki: string | null;
}

export function blockContext(state: EditorState): BlockContext {
  const { $from } = state.selection;
  const context: BlockContext = { table: null, code: null, callout: null, wiki: wikiQuery(state) };
  for (let depth = $from.depth; depth > 0; depth--) {
    const node = $from.node(depth);
    const pos = $from.before(depth);
    if (!context.code && node.type.name === 'code_block')
      context.code = { pos, language: String(node.attrs.language ?? '') };
    if (!context.callout && node.type.name === 'callout')
      context.callout = { pos, kind: String(node.attrs.kind) };
    if (!context.table && node.type.name === 'table_row') context.table = { headerRow: false };
    if (!context.table && node.type.name === 'table_header_row')
      context.table = { headerRow: true };
  }
  return context;
}

/* ---- Wiki links (P9-06; ADR-0007 amendment) ---- */

export interface WikiAttrs {
  target: string;
  heading: string;
  alias: string;
}

const WIKI_IN_TEXT = /\[\[([^[\]|#\n]+)(?:#([^[\]|\n]+))?(?:\|([^[\]\n]+))?\]\]/g;

/** Characters that would end or restructure `[[…]]` (or start raw HTML) are dropped. */
function cleanWikiPart(text: string): string {
  return text.replace(/[[\]\n<>|#]/g, '').trim();
}

/** `[[target#heading|alias]]` for the given attributes; always a single safe token. */
export function wikiSource({ target, heading, alias }: WikiAttrs): string {
  const head = cleanWikiPart(heading);
  const label = alias.replace(/[[\]\n<>]/g, '').trim();
  return `[[${cleanWikiPart(target)}${head ? `#${head}` : ''}${label ? `|${label}` : ''}]]`;
}

/** Parses the inside of `[[…]]`. */
export function parseWikiInner(inner: string): WikiAttrs {
  const [beforeAlias = '', ...aliasParts] = inner.split('|');
  const [target = '', ...headingParts] = beforeAlias.split('#');
  return {
    target: target.trim(),
    heading: headingParts.join('#').trim(),
    alias: aliasParts.join('|').trim(),
  };
}

export function wikiLabel({ target, heading, alias }: WikiAttrs): string {
  return alias || (heading ? `${target} › ${heading}` : target);
}

/**
 * Turns `[[…]]` in mdast text into `wikiLink` nodes for the editor (not inside links or code).
 * The renderer has its own equivalent in `@leandocs/shared`.
 */
export function splitWikiLinks(tree: { children?: unknown[] }): void {
  const walk = (node: { type?: string; value?: string; children?: unknown[] }) => {
    if (!node.children || node.type === 'link' || node.type === 'linkReference') return;
    const next: unknown[] = [];
    for (const child of node.children as { type?: string; value?: string }[]) {
      if (child.type !== 'text' || !child.value?.includes('[[')) {
        walk(child as never);
        next.push(child);
        continue;
      }
      let last = 0;
      for (const match of child.value.matchAll(WIKI_IN_TEXT)) {
        if (match.index > last)
          next.push({ type: 'text', value: child.value.slice(last, match.index) });
        next.push({
          type: 'wikiLink',
          target: match[1]!.trim(),
          heading: match[2]?.trim() ?? '',
          alias: match[3]?.trim() ?? '',
        });
        last = match.index + match[0].length;
      }
      if (last < child.value.length) next.push({ type: 'text', value: child.value.slice(last) });
    }
    node.children = next;
  };
  walk(tree as never);
}

/** Inline wiki link: a non-editable chip in Visual, written back verbatim as `[[…]]`. */
export const wikiLinkSchema = $nodeSchema('wiki_link', () => ({
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  attrs: {
    target: { default: '', validate: 'string' },
    heading: { default: '', validate: 'string' },
    alias: { default: '', validate: 'string' },
  },
  parseDOM: [
    {
      tag: 'span[data-wiki-target]',
      getAttrs: (dom) => ({
        target: (dom as HTMLElement).dataset.wikiTarget ?? '',
        heading: (dom as HTMLElement).dataset.wikiHeading ?? '',
        alias: (dom as HTMLElement).dataset.wikiAlias ?? '',
      }),
    },
  ],
  toDOM: (node) => {
    const attrs = node.attrs as WikiAttrs;
    return [
      'span',
      {
        class: 'wiki-link',
        contenteditable: 'false',
        'data-wiki-target': attrs.target,
        'data-wiki-heading': attrs.heading,
        'data-wiki-alias': attrs.alias,
        title: wikiSource(attrs),
      },
      wikiLabel(attrs),
    ];
  },
  parseMarkdown: {
    match: (node) => node.type === 'wikiLink',
    runner: (state, node, type) => {
      const attrs = node as unknown as WikiAttrs;
      state.addNode(type, { target: attrs.target, heading: attrs.heading, alias: attrs.alias });
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === 'wiki_link',
    runner: (state, node) => {
      // Raw inline output, so remark does not escape the brackets.
      state.addNode('html', undefined, wikiSource(node.attrs as WikiAttrs));
    },
  },
}));

/** `[[` with the text typed so far before the caret, for the link picker; null otherwise. */
export function wikiQuery(state: EditorState): string | null {
  const { $from, empty } = state.selection;
  if (!empty || $from.parent.type.name === 'code_block') return null;
  const before = $from.parent.textBetween(0, $from.parentOffset, undefined, '￼');
  const match = /\[\[([^[\]|#\n￼]*)$/.exec(before);
  return match ? match[1]! : null;
}
