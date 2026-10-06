import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { TextSelection } from '@milkdown/kit/prose/state';
import type { Editor } from '@milkdown/kit/core';
import { commandsCtx, editorViewCtx } from '@milkdown/kit/core';
import { insert } from '@milkdown/kit/utils';
import {
  createCodeBlockCommand,
  paragraphSchema,
  insertHrCommand,
  insertImageCommand,
  toggleLinkCommand,
  toggleStrongCommand,
  toggleEmphasisCommand,
  toggleInlineCodeCommand,
  turnIntoTextCommand,
  wrapInHeadingCommand,
  wrapInBulletListCommand,
  wrapInOrderedListCommand,
  wrapInBlockquoteCommand,
} from '@milkdown/kit/preset/commonmark';
import {
  addColAfterCommand,
  addColBeforeCommand,
  addRowAfterCommand,
  addRowBeforeCommand,
  insertTableCommand,
  toggleStrikethroughCommand,
} from '@milkdown/kit/preset/gfm';
import { deleteColumn, deleteRow, deleteTable } from '@milkdown/kit/prose/tables';
import { CALLOUT_TYPES, createLinkResolver } from '@leandocs/shared';
import {
  BoldIcon,
  BulletListIcon,
  ChecklistIcon,
  CodeBlockIcon,
  DividerIcon,
  ImageIcon,
  InfoIcon,
  InlineCodeIcon,
  ItalicIcon,
  LinkIcon,
  NumberedListIcon,
  ParagraphIcon,
  QuoteIcon,
  StrikethroughIcon,
  TableIcon,
} from '../../components/icons';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { TextField, FormError } from '../../components/ui/Field';
import { createVisualEditor, type CaretRect } from './create-editor';
import { linkCandidates, wikiTargetFor } from '../link-picker';
import type { LinkTarget } from '../../markdown/links';
import { CALLOUT_LABELS, CODE_LANGUAGES, type BlockContext } from './blocks';
import { safeEditorUrl } from './preservation';
import './visual.css';
import { UploadControl, type UploadFiles } from '../../attachments/UploadControl';

interface Props {
  initialValue: string;
  onChange: (value: string) => void;
  onSave: () => void;
  onExit: () => void;
  onSource: () => void;
  onUpload?: UploadFiles;
  resolveUrl?: (url: string) => string;
  /** Documents for the `[[` picker and broken-link styling (P9-06). */
  linkTargets?: LinkTarget[];
  /** The edited document (not offered in the `[[` picker). */
  documentId?: string;
}

export function VisualEditor({
  initialValue,
  onChange,
  onSave,
  onExit,
  onSource,
  onUpload,
  resolveUrl,
  linkTargets = [],
  documentId,
}: Props) {
  const host = useRef<HTMLDivElement>(null);
  const attach = useRef<(files: File[]) => void>(() => undefined);
  const editor = useRef<Editor | null>(null);
  const callbacks = useRef({ onChange, onSave, onExit, onUpload, resolveUrl, linkTargets });
  useLayoutEffect(() => {
    callbacks.current = { onChange, onSave, onExit, onUpload, resolveUrl, linkTargets };
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [selected, setSelected] = useState(false);
  const [slash, setSlash] = useState(false);
  const [active, setActive] = useState(0);
  const [caret, setCaret] = useState<CaretRect>();
  const [context, setContext] = useState<BlockContext>({
    table: null,
    code: null,
    callout: null,
    wiki: null,
  });
  const [dialog, setDialog] = useState<'Link' | 'Image' | null>(null);
  const [url, setUrl] = useState('');
  const [label, setLabel] = useState('');
  const [urlError, setUrlError] = useState<string>();

  useEffect(() => {
    if (!host.current) return;
    let cancelled = false;
    const root = document.createElement('div');
    host.current.append(root);
    void createVisualEditor({
      root,
      source: initialValue,
      onUpload: onUpload ? (files) => callbacks.current.onUpload!(files) : undefined,
      resolveUrl: (url) => callbacks.current.resolveUrl?.(url) ?? url,
      isWikiTarget: (target) =>
        callbacks.current.linkTargets.length === 0 ||
        createLinkResolver(callbacks.current.linkTargets).wiki(target) !== undefined,
      onUploadReady: (upload) => {
        attach.current = upload;
      },
      onChange: (value) => {
        if (!cancelled) callbacks.current.onChange(value);
      },
      onSave: () => callbacks.current.onSave(),
      onExit: () => callbacks.current.onExit(),
      onSelection: (selection, command, rect, block) => {
        if (!cancelled) {
          setSelected(selection);
          setSlash(command);
          setCaret(rect);
          setContext(block);
        }
      },
    })
      .then((created) => {
        if (cancelled) {
          void created.destroy().then(() => root.remove());
          return;
        }
        editor.current = created;
        setLoading(false);
      })
      .catch((reason: unknown) => {
        root.remove();
        if (!cancelled) {
          setLoading(false);
          setError(reason instanceof Error ? reason.message : 'Unable to start editor');
        }
      });
    return () => {
      cancelled = true;
      const current = editor.current;
      editor.current = null;
      if (current) void current.destroy().then(() => root.remove());
    };
    // The session remounts on an external version or mode switch, preserving the latest Markdown.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Floating menus follow the caret while the page scrolls (they are fixed to the viewport).
  useEffect(() => {
    if (!slash && !selected) return;
    const update = () =>
      editor.current?.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        try {
          const { top, bottom, left } = view.coordsAtPos(view.state.selection.from);
          setCaret({ top, bottom, left });
        } catch {
          setCaret(undefined);
        }
      });
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [slash, selected]);

  // `[[` link picker (P9-06): open while the caret follows `[[query`, until Escape.
  const [dismissedWiki, setDismissedWiki] = useState(false);
  if (context.wiki === null && dismissedWiki) setDismissedWiki(false);
  const wikiItems =
    context.wiki !== null && !dismissedWiki && !slash
      ? linkCandidates(linkTargets, context.wiki, 8, documentId)
      : [];
  const [wikiActive, setWikiActive] = useState(0);
  const wikiIndex = Math.min(wikiActive, Math.max(0, wikiItems.length - 1));
  const insertWikiLink = (document: LinkTarget) => {
    editor.current?.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      const { $from } = view.state.selection;
      const query = context.wiki ?? '';
      const from = $from.pos - query.length - 2;
      // Swallow `]]` already typed (or auto-closed) right after the caret.
      const after = $from.parent.textBetween(
        $from.parentOffset,
        Math.min($from.parent.content.size, $from.parentOffset + 2),
      );
      const to = after === ']]' ? $from.pos + 2 : $from.pos;
      const node = view.state.schema.nodes.wiki_link!.create({
        target: wikiTargetFor(document, linkTargets),
        heading: '',
        alias: '',
      });
      view.dispatch(view.state.tr.replaceWith(from, to, node).scrollIntoView());
      view.focus();
    });
    setWikiActive(0);
  };

  const run = (action: string) => {
    const current = editor.current;
    if (!current) return;
    current.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      if (slash)
        view.dispatch(
          view.state.tr.delete(view.state.selection.from - 1, view.state.selection.from),
        );
      const commands = ctx.get(commandsCtx);
      switch (action) {
        case 'Paragraph':
          commands.call(turnIntoTextCommand.key);
          break;
        case 'Heading 1':
        case 'Heading 2':
        case 'Heading 3':
          commands.call(wrapInHeadingCommand.key, Number(action.slice(-1)));
          break;
        case 'Bold':
          commands.call(toggleStrongCommand.key);
          break;
        case 'Italic':
          commands.call(toggleEmphasisCommand.key);
          break;
        case 'Strikethrough':
          commands.call(toggleStrikethroughCommand.key);
          break;
        case 'Inline code':
          commands.call(toggleInlineCodeCommand.key);
          break;
        case 'Bullet list':
          commands.call(wrapInBulletListCommand.key);
          break;
        case 'Numbered list':
          commands.call(wrapInOrderedListCommand.key);
          break;
        case 'Checklist':
          insert('- [ ] Task')(ctx);
          break;
        case 'Quote':
          commands.call(wrapInBlockquoteCommand.key);
          break;
        case 'Code block':
          commands.call(createCodeBlockCommand.key);
          break;
        case 'Table':
          commands.call(insertTableCommand.key, { row: 3, col: 3 });
          break;
        case 'Divider':
          commands.call(insertHrCommand.key);
          break;
        case 'Callout': {
          // An editable callout with an empty paragraph, caret inside (P6-10).
          const callout = view.state.schema.nodes.callout!.create(
            { kind: 'note' },
            paragraphSchema.type(ctx).create(),
          );
          const tr = view.state.tr.replaceSelectionWith(callout);
          let at = -1;
          tr.doc.descendants((node, pos) => {
            if (node === callout) at = pos;
            return at === -1;
          });
          // pos + 1 enters the callout, + 1 more enters its paragraph.
          if (at >= 0) tr.setSelection(TextSelection.create(tr.doc, at + 2));
          view.dispatch(tr.scrollIntoView());
          break;
        }
        case 'Link':
        case 'Image':
          setUrl('');
          setLabel(view.state.doc.textBetween(view.state.selection.from, view.state.selection.to));
          setUrlError(undefined);
          setDialog(action);
          break;
      }
      view.focus();
    });
    setSlash(false);
    setActive(0);
  };
  /** Table, code block and callout actions for the block at the caret (P6-09…P6-11). */
  const runContext = (action: string, value?: string) => {
    editor.current?.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      const commands = ctx.get(commandsCtx);
      switch (action) {
        case 'Row above':
          commands.call(addRowBeforeCommand.key);
          break;
        case 'Row below':
          commands.call(addRowAfterCommand.key);
          break;
        case 'Column left':
          commands.call(addColBeforeCommand.key);
          break;
        case 'Column right':
          commands.call(addColAfterCommand.key);
          break;
        case 'Delete row':
          deleteRow(view.state, view.dispatch);
          break;
        case 'Delete column':
          deleteColumn(view.state, view.dispatch);
          break;
        case 'Delete table':
          deleteTable(view.state, view.dispatch);
          break;
        case 'Language':
          if (context.code)
            view.dispatch(
              view.state.tr.setNodeAttribute(context.code.pos, 'language', value ?? ''),
            );
          break;
        case 'Callout type':
          if (context.callout)
            view.dispatch(view.state.tr.setNodeAttribute(context.callout.pos, 'kind', value));
          break;
      }
      view.focus();
    });
  };
  const tableButton = (label: string, disabled = false) => (
    <button
      key={label}
      type="button"
      className="visual-toolbar__text"
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => runContext(label)}
    >
      {label}
    </button>
  );
  const buttons = [
    { label: 'Paragraph', icon: ParagraphIcon },
    { label: 'Heading 1', text: 'H1' },
    { label: 'Heading 2', text: 'H2' },
    { label: 'Heading 3', text: 'H3' },
    { label: 'Bold', icon: BoldIcon },
    { label: 'Italic', icon: ItalicIcon },
    { label: 'Strikethrough', icon: StrikethroughIcon },
    { label: 'Inline code', icon: InlineCodeIcon },
    { label: 'Bullet list', icon: BulletListIcon },
    { label: 'Numbered list', icon: NumberedListIcon },
    { label: 'Checklist', icon: ChecklistIcon },
    { label: 'Quote', icon: QuoteIcon },
    { label: 'Link', icon: LinkIcon },
    { label: 'Image', icon: ImageIcon },
    { label: 'Table', icon: TableIcon },
    { label: 'Code block', icon: CodeBlockIcon },
    { label: 'Callout', icon: InfoIcon },
    { label: 'Divider', icon: DividerIcon },
  ];
  const slashItems = [
    'Heading 1',
    'Heading 2',
    'Heading 3',
    'Bullet list',
    'Numbered list',
    'Checklist',
    'Code block',
    'Table',
    'Callout',
    'Image',
    'Divider',
  ];
  const toolbarButton = (item: (typeof buttons)[number]) => (
    <button
      key={item.label}
      type="button"
      aria-label={item.label}
      title={item.label}
      disabled={loading || !!error}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => run(item.label)}
    >
      {item.icon ? <item.icon size={16} aria-hidden="true" /> : item.text}
    </button>
  );
  const submit = () => {
    if (!url.trim() || !safeEditorUrl(url.trim())) {
      setUrlError('Enter a safe link or image location.');
      return;
    }
    editor.current?.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      if (dialog === 'Link') {
        if (view.state.selection.empty) {
          const from = view.state.selection.from;
          const text = label || url;
          const transaction = view.state.tr.insertText(text);
          transaction.setSelection(TextSelection.create(transaction.doc, from, from + text.length));
          view.dispatch(transaction);
        }
        ctx.get(commandsCtx).call(toggleLinkCommand.key, { href: url.trim() });
        const transaction = view.state.tr;
        transaction.setSelection(TextSelection.create(transaction.doc, view.state.selection.to));
        transaction.setStoredMarks([]);
        view.dispatch(transaction);
      } else ctx.get(commandsCtx).call(insertImageCommand.key, { src: url.trim(), alt: label });
      view.focus();
    });
    setDialog(null);
  };
  return (
    <div
      className="visual-editor"
      onKeyDownCapture={(event) => {
        if (
          wikiItems.length > 0 &&
          ['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(event.key)
        ) {
          event.preventDefault();
          event.stopPropagation();
          if (event.key === 'Escape') setDismissedWiki(true);
          else if (event.key === 'Enter' || event.key === 'Tab')
            insertWikiLink(wikiItems[wikiIndex]!);
          else
            setWikiActive(
              (wikiIndex + (event.key === 'ArrowDown' ? 1 : wikiItems.length - 1)) %
                wikiItems.length,
            );
          return;
        }
        if (!slash) return;
        if (['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(event.key)) {
          event.preventDefault();
          event.stopPropagation();
          if (event.key === 'Escape') setSlash(false);
          else if (event.key === 'Enter') run(slashItems[active] ?? 'Paragraph');
          else
            setActive(
              (index) =>
                (index + (event.key === 'ArrowDown' ? 1 : slashItems.length - 1)) %
                slashItems.length,
            );
        }
      }}
    >
      <div className="visual-toolbar" role="toolbar" aria-label="Formatting">
        {buttons.map(toolbarButton)}
        {onUpload && (
          <UploadControl disabled={loading || !!error} onFiles={(files) => attach.current(files)} />
        )}
        {context.table && (
          <div className="visual-toolbar__context" role="group" aria-label="Table">
            {tableButton('Row above', context.table.headerRow)}
            {tableButton('Row below')}
            {tableButton('Column left')}
            {tableButton('Column right')}
            {tableButton('Delete row', context.table.headerRow)}
            {tableButton('Delete column')}
            {tableButton('Delete table')}
          </div>
        )}
        {context.code && (
          <div className="visual-toolbar__context" role="group" aria-label="Code block">
            <select
              aria-label="Code language"
              value={context.code.language}
              onChange={(event) => runContext('Language', event.target.value)}
            >
              {CODE_LANGUAGES.some((item) => item.value === context.code!.language) ? null : (
                <option value={context.code.language}>{context.code.language}</option>
              )}
              {CODE_LANGUAGES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
        )}
        {context.callout && (
          <div className="visual-toolbar__context" role="group" aria-label="Callout">
            <select
              aria-label="Callout type"
              value={context.callout.kind}
              onChange={(event) => runContext('Callout type', event.target.value)}
            >
              {CALLOUT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {CALLOUT_LABELS[type]}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      {selected && (
        <div
          className="visual-bubble"
          role="toolbar"
          aria-label="Selection formatting"
          style={floatingStyle(caret, 'above')}
        >
          {buttons
            .filter((item) =>
              ['Bold', 'Italic', 'Strikethrough', 'Inline code', 'Link'].includes(item.label),
            )
            .map(toolbarButton)}
        </div>
      )}
      {wikiItems.length > 0 && (
        <div
          className="visual-slash visual-wiki"
          role="listbox"
          aria-label="Link to document"
          style={floatingStyle(caret, 'below')}
        >
          {wikiItems.map((item, index) => (
            <button
              key={item.id}
              type="button"
              role="option"
              aria-selected={index === wikiIndex}
              className={index === wikiIndex ? 'is-active' : ''}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => insertWikiLink(item)}
            >
              <span className="visual-wiki__title">{item.title}</span>
              <span className="visual-wiki__path">{item.path.replace(/\.md$/i, '')}</span>
            </button>
          ))}
        </div>
      )}
      {slash && (
        <div
          className="visual-slash"
          role="menu"
          aria-label="Insert block"
          style={floatingStyle(caret, 'below')}
        >
          {slashItems.map((item, index) => (
            <button
              key={item}
              type="button"
              role="menuitem"
              className={active === index ? 'is-active' : ''}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => run(item)}
            >
              {item}
            </button>
          ))}
        </div>
      )}
      {loading && <p role="status">Loading editor…</p>}
      {error && (
        <div role="alert">
          <p>Unable to load the visual editor.</p>
          <Button onClick={onSource}>Edit in Source</Button>
          <details>
            <summary>Details</summary>
            {error}
          </details>
        </div>
      )}
      <div ref={host} className="markdown visual-content" />
      {dialog && (
        <Dialog
          open
          title={`Insert ${dialog.toLowerCase()}`}
          onOpenChange={(open) => !open && setDialog(null)}
          onSubmit={submit}
          actions={
            <>
              <Button onClick={() => setDialog(null)}>Cancel</Button>
              <Button type="submit" variant="primary">
                Insert
              </Button>
            </>
          }
        >
          <TextField
            label="Location"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            autoFocus
            hint={
              dialog === 'Image'
                ? 'Use an existing image URL, or choose Attach files in the toolbar.'
                : undefined
            }
          />
          <TextField
            label={dialog === 'Image' ? 'Alternative text' : 'Text'}
            value={label}
            onChange={(event) => setLabel(event.target.value)}
          />
          <FormError message={urlError} />
        </Dialog>
      )}
    </div>
  );
}

const SLASH_MENU_HEIGHT = 360;
const BUBBLE_HEIGHT = 44;

/**
 * Viewport position for a floating menu at the caret (UI_SPEC §37–38). The slash menu opens below
 * the caret, or above it when there is no room; the selection toolbar sits above the selection.
 * Without a caret rectangle the CSS fallback (top of the editor) applies.
 */
function floatingStyle(caret: CaretRect | undefined, prefer: 'above' | 'below'): CSSProperties {
  if (!caret || typeof window === 'undefined') return {};
  const left = Math.max(8, Math.min(caret.left, window.innerWidth - 280));
  if (prefer === 'above') {
    const top = caret.top - BUBBLE_HEIGHT - 6;
    return {
      position: 'fixed',
      left,
      top: top > 8 ? top : caret.bottom + 6,
      right: 'auto',
      bottom: 'auto',
    };
  }
  const roomBelow = window.innerHeight - caret.bottom;
  return roomBelow >= SLASH_MENU_HEIGHT || roomBelow >= caret.top
    ? { position: 'fixed', left, top: caret.bottom + 4, bottom: 'auto', maxHeight: roomBelow - 12 }
    : {
        position: 'fixed',
        left,
        top: 'auto',
        bottom: window.innerHeight - caret.top + 4,
        maxHeight: caret.top - 12,
      };
}
