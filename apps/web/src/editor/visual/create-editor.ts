import {
  Editor,
  defaultValueCtx,
  rootCtx,
  editorViewCtx,
  serializerCtx,
  editorViewOptionsCtx,
  parserCtx,
} from '@milkdown/kit/core';
import { commonmark, linkSchema, imageSchema } from '@milkdown/kit/preset/commonmark';
import { gfm, extendListItemSchemaForTask } from '@milkdown/kit/preset/gfm';
import { history } from '@milkdown/kit/plugin/history';
import { $nodeSchema, $remark, $prose } from '@milkdown/kit/utils';
import { Plugin, Selection, type SelectionBookmark } from '@milkdown/kit/prose/state';
import { keymap } from '@milkdown/kit/prose/keymap';
import { Slice, type Node } from '@milkdown/kit/prose/model';
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view';
import type { UploadFiles } from '../../attachments/UploadControl';
import remarkDirective from 'remark-directive';
import type { Root } from 'mdast';
import { preserveBlocks, safeEditorUrl } from './preservation';
import {
  blockContext,
  calloutSchema,
  codeBlockExit,
  codeBlockView,
  codeHighlight,
  splitWikiLinks,
  parseWikiInner,
  wikiLinkSchema,
  type BlockContext,
  type WikiAttrs,
} from './blocks';
import { InputRule } from '@milkdown/kit/prose/inputrules';
import { $inputRule } from '@milkdown/kit/utils';

export const preservedBlock = $nodeSchema('preserved_block', () => ({
  group: 'block',
  atom: true,
  selectable: true,
  attrs: { source: { default: '', validate: 'string' } },
  parseDOM: [
    { tag: 'pre[data-preserved]', getAttrs: (dom) => ({ source: dom.textContent ?? '' }) },
  ],
  toDOM: (node) => [
    'pre',
    {
      'data-preserved': 'true',
      class: 'visual-opaque',
      title: 'Preserved Markdown block. Edit in Source mode.',
    },
    node.attrs.source as string,
  ],
  parseMarkdown: {
    match: (node) => node.type === 'preservedBlock',
    runner: (state, node, type) => {
      state.addNode(type, { source: node.value });
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === 'preserved_block',
    runner: (state, node) => {
      state.addNode('html', undefined, node.attrs.source as string);
    },
  },
}));

export interface CaretRect {
  top: number;
  bottom: number;
  left: number;
}

export interface VisualOptions {
  root: HTMLElement;
  source: string;
  onChange: (source: string) => void;
  /** Selection state plus the viewport rectangle of the selection start (for floating menus). */
  onSelection?: (
    selected: boolean,
    slash: boolean,
    caret: CaretRect | undefined,
    context: BlockContext,
  ) => void;
  onSave: () => void;
  onExit: () => void;
  onUpload?: UploadFiles;
  onUploadReady?: (upload: (files: File[]) => void) => void;
  resolveUrl?: (url: string) => string;
  /** Whether a wiki target resolves to a document; unresolved links are styled as broken. */
  isWikiTarget?: (target: string) => boolean;
}

/** Headless Milkdown; only Markdown crosses the existing save boundary. */
export async function createVisualEditor(options: VisualOptions): Promise<Editor> {
  let originals: string[] = [];
  const unchanged = new WeakMap<Node, string>();
  let ready = false;
  const directives = $remark('leandocs-directives', () => remarkDirective);
  const preservation = $remark('leandocs-preservation', () => () => (tree, file) => {
    originals = preserveBlocks(tree as Root, String(file.value));
    // Wiki links become inline nodes (P9-06) instead of making their paragraph opaque.
    splitWikiLinks(tree as never);
  });
  const wikiLinks = wikiLinkSchema.extendSchema((previous) => (ctx) => ({
    ...previous(ctx),
    toDOM: (node) => {
      const spec = previous(ctx).toDOM!(node) as [string, Record<string, string>, string];
      const known = options.isWikiTarget?.((node.attrs as WikiAttrs).target) ?? true;
      return [
        spec[0],
        { ...spec[1], class: known ? 'wiki-link' : 'wiki-link broken-link' },
        spec[2],
      ];
    },
  }));
  // Typing `[[Target]]` by hand turns it into a link as soon as it is closed.
  const wikiInput = $inputRule(
    (ctx) =>
      new InputRule(/\[\[([^[\]\n]+)\]\]$/, (state, match, start, end) => {
        const attrs = parseWikiInner(match[1] ?? '');
        if (!attrs.target) return null;
        return state.tr.replaceWith(start, end, wikiLinkSchema.type(ctx).create(attrs));
      }),
  );
  const changes = $prose(
    (ctx) =>
      new Plugin({
        view: () => ({
          update: (view, previous) => {
            if (!ready) return;
            const selection = view.state.selection;
            const before = selection.$from.parent.textBetween(0, selection.$from.parentOffset);
            let caret: CaretRect | undefined;
            try {
              const { top, bottom, left } = view.coordsAtPos(selection.from);
              caret = { top, bottom, left };
            } catch {
              caret = undefined; // layout not available (e.g. tests without a renderer)
            }
            options.onSelection?.(
              !selection.empty,
              /^\/$/.test(before),
              caret,
              blockContext(view.state),
            );
            if (view.state.doc.eq(previous.doc)) return;
            const serialize = ctx.get(serializerCtx);
            const blocks: string[] = [];
            view.state.doc.forEach((node) => {
              blocks.push(
                unchanged.get(node) ??
                  // Browsers type U+00A0 next to inline atoms (wiki links); write plain spaces.
                  serialize(view.state.schema.topNodeType.create(null, node))
                    .trimEnd()
                    .replace(/\u00a0/g, ' '),
              );
            });
            options.onChange(blocks.join('\n\n') + (options.source.endsWith('\n') ? '\n' : ''));
          },
        }),
      }),
  );
  const uploads = $prose((ctx) => {
    const pending = new Set<{ bookmark: SelectionBookmark; image: boolean }>();
    let alive = true;
    const upload = (files: File[]) => {
      if (!options.onUpload) return;
      const view = ctx.get(editorViewCtx);
      const anchor = {
        bookmark: view.state.selection.getBookmark(),
        image: files.some((file) => file.type.startsWith('image/')),
      };
      pending.add(anchor);
      view.dispatch(view.state.tr.setMeta('upload', true));
      void options
        .onUpload(files)
        .then((markdown) => {
          if (!alive || !markdown) return;
          const doc = ctx.get(parserCtx)(markdown);
          if (!doc) return;
          const selection = anchor.bookmark.resolve(view.state.doc);
          pending.delete(anchor);
          view.dispatch(
            view.state.tr
              .setSelection(selection)
              .replaceSelection(new Slice(doc.content, 0, 0))
              .scrollIntoView(),
          );
        })
        .finally(() => {
          pending.delete(anchor);
          if (alive) view.dispatch(view.state.tr.setMeta('upload', true));
        });
    };
    options.onUploadReady?.(upload);
    return new Plugin({
      state: {
        init: () => null,
        apply: (transaction) => {
          for (const anchor of pending) anchor.bookmark = anchor.bookmark.map(transaction.mapping);
          return null;
        },
      },
      view: () => ({
        destroy: () => {
          alive = false;
        },
      }),
      props: {
        decorations: (state) =>
          DecorationSet.create(
            state.doc,
            Array.from(pending, (anchor) =>
              Decoration.widget(anchor.bookmark.resolve(state.doc).from, () => {
                const span = document.createElement('span');
                span.className = 'upload-status';
                span.textContent = anchor.image ? 'Uploading image…' : 'Uploading file…';
                span.setAttribute('role', 'status');
                return span;
              }),
            ),
          ),
        handlePaste: (_view, event) => {
          const files = Array.from(event.clipboardData?.files ?? []);
          if (!files.length || !options.onUpload) return false;
          event.preventDefault();
          upload(files);
          return true;
        },
        handleDrop: (view, event) => {
          const files = Array.from(event.dataTransfer?.files ?? []);
          if (!files.length || !options.onUpload) return false;
          event.preventDefault();
          const pos = view.posAtCoords({ left: event.clientX, top: event.clientY });
          if (pos)
            view.dispatch(
              view.state.tr.setSelection(Selection.near(view.state.doc.resolve(pos.pos))),
            );
          upload(files);
          return true;
        },
      },
    });
  });
  const shortcuts = $prose(() =>
    keymap({
      'Mod-s': () => {
        options.onSave();
        return true;
      },
      Escape: () => {
        options.onExit();
        return true;
      },
    }),
  );
  const safeLinks = linkSchema.extendSchema((previous) => (ctx) => ({
    ...previous(ctx),
    toDOM: (node) => ['a', { href: safeEditorUrl(String(node.attrs.href ?? '')) }, 0],
  }));
  const safeImages = imageSchema.extendSchema((previous) => (ctx) => ({
    ...previous(ctx),
    parseMarkdown: {
      match: (node) => node.type === 'image',
      runner: (state, node, type) => {
        state.addNode(type, { src: node.url ?? '', alt: node.alt ?? '', title: node.title ?? '' });
      },
    },
    toDOM: (node) => [
      'img',
      {
        src: safeEditorUrl(
          options.resolveUrl?.(String(node.attrs.src ?? '')) ?? String(node.attrs.src ?? ''),
        ),
        alt: String(node.attrs.alt ?? ''),
        title: String(node.attrs.title ?? ''),
      },
    ],
  }));
  const tasks = extendListItemSchemaForTask.extendSchema((previous) => (ctx) => ({
    ...previous(ctx),
    toDOM: (node) =>
      node.attrs.checked == null
        ? previous(ctx).toDOM!(node)
        : [
            'li',
            { 'data-checked': String(node.attrs.checked), 'data-item-type': 'task' },
            [
              'input',
              {
                type: 'checkbox',
                contenteditable: 'false',
                'data-task-toggle': 'true',
                checked: node.attrs.checked ? 'checked' : null,
                'aria-label': 'Toggle task',
              },
            ],
            ['div', 0],
          ],
  }));
  const taskClicks = $prose(
    () =>
      new Plugin({
        props: {
          handleClickOn: (view, _pos, node, nodePos, event) => {
            if (
              node.type.name !== 'list_item' ||
              node.attrs.checked == null ||
              !(event.target instanceof Element) ||
              !event.target.closest('[data-task-toggle]')
            )
              return false;
            view.dispatch(
              view.state.tr.setNodeMarkup(nodePos, undefined, {
                ...node.attrs,
                checked: !node.attrs.checked,
              }),
            );
            return true;
          },
        },
      }),
  );
  const editor = await Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, options.root);
      ctx.set(defaultValueCtx, options.source);
      ctx.update(editorViewOptionsCtx, (value) => ({
        ...value,
        attributes: { 'aria-label': 'Visual document', role: 'textbox', 'aria-multiline': 'true' },
      }));
    })
    .use(directives)
    .use(preservation)
    // Before the presets, so its Enter/ArrowDown win over the default code block keys.
    .use(codeBlockExit)
    .use(commonmark)
    .use(codeBlockView)
    .use(gfm)
    .use(calloutSchema)
    .use(wikiLinks)
    .use(wikiInput)
    .use(codeHighlight)
    .use(history)
    .use(preservedBlock)
    .use(safeLinks)
    .use(safeImages)
    .use(tasks)
    .use(taskClicks)
    .use(uploads)
    .use(shortcuts)
    .use(changes)
    .create();
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    if (view.state.doc.childCount === originals.length)
      view.state.doc.forEach((node, _offset, index) => unchanged.set(node, originals[index] ?? ''));
    ready = true;
    // Lazy editor startup must not steal focus from a menu or dialog opened meanwhile.
    if (document.activeElement === document.body || options.root.contains(document.activeElement))
      view.focus();
  });
  return editor;
}
