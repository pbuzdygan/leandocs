import { useEffect, useLayoutEffect, useRef } from 'react';
import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  type CompletionContext,
  type CompletionResult,
} from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import {
  bracketMatching,
  HighlightStyle,
  indentOnInput,
  syntaxHighlighting,
} from '@codemirror/language';
import {
  closeSearchPanel,
  highlightSelectionMatches,
  search,
  searchKeymap,
} from '@codemirror/search';
import { EditorSelection, EditorState, type Extension } from '@codemirror/state';
import {
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  placeholder,
} from '@codemirror/view';
import { tags } from '@lezer/highlight';
import './source-editor.css';
import { UploadControl, type UploadFiles } from '../attachments/UploadControl';
import type { LinkTarget } from '../markdown/links';
import { linkCandidates, wikiTargetFor } from './link-picker';

/**
 * `[[` document suggestions (PROJECT_SPEC §23). Picking one writes `Target]]`, reusing a `]]`
 * that bracket auto-closing already inserted.
 */
export function wikiCompletions(getTargets: () => LinkTarget[], excludeId?: string) {
  return (context: CompletionContext): CompletionResult | null => {
    const match = context.matchBefore(/\[\[[^[\]|#\n]*/);
    if (!match) return null;
    const targets = getTargets();
    if (targets.length === 0) return null;
    return {
      from: match.from + 2,
      filter: false,
      options: linkCandidates(targets, match.text.slice(2), 20, excludeId).map((document) => ({
        label: document.title,
        detail: document.path.replace(/\.md$/i, ''),
        apply: (view, _completion, from, to) => {
          const text = `${wikiTargetFor(document, targets)}]]`;
          const end = view.state.sliceDoc(to, to + 2) === ']]' ? to + 2 : to;
          view.dispatch({
            changes: { from, to: end, insert: text },
            selection: { anchor: from + text.length },
          });
        },
      })),
    };
  };
}

/** Subtle Markdown colouring — "a simple technical text editor, not an IDE" (UI_SPEC §41, §153). */
const markdownHighlight = HighlightStyle.define([
  { tag: tags.heading, class: 'cm-md-heading' },
  { tag: [tags.link, tags.url], class: 'cm-md-link' },
  { tag: tags.monospace, class: 'cm-md-code' },
  { tag: tags.strong, class: 'cm-md-strong' },
  { tag: tags.emphasis, class: 'cm-md-emphasis' },
  { tag: tags.strikethrough, class: 'cm-md-strike' },
  { tag: tags.quote, class: 'cm-md-quote' },
  { tag: [tags.processingInstruction, tags.contentSeparator, tags.meta], class: 'cm-md-mark' },
  { tag: [tags.keyword, tags.typeName, tags.tagName], class: 'cm-code-keyword' },
  { tag: [tags.string, tags.special(tags.string)], class: 'cm-code-string' },
  { tag: [tags.number, tags.bool, tags.atom], class: 'cm-code-number' },
  { tag: [tags.comment], class: 'cm-code-comment' },
  {
    tag: [tags.propertyName, tags.attributeName, tags.definition(tags.variableName)],
    class: 'cm-code-attr',
  },
]);

/** Apply Markdown emphasis while keeping the selected text available for further editing. */
function wrapSelection(view: EditorView, marker: string): boolean {
  view.dispatch(
    view.state.changeByRange((range) => ({
      changes: [
        { from: range.from, insert: marker },
        { from: range.to, insert: marker },
      ],
      range: EditorSelection.range(range.from + marker.length, range.to + marker.length),
    })),
  );
  return true;
}

export interface SourceEditorProps {
  /** Initial content; the editor is uncontrolled afterwards (remount with a new `key` to reset). */
  initialValue: string;
  onChange: (value: string) => void;
  /** Ctrl/Cmd+S */
  onSave: () => void;
  /** Esc (when no editor panel such as search is open) */
  onExit: () => void;
  lineNumbers?: boolean;
  autoFocus?: boolean;
  onUpload?: UploadFiles;
  /** Documents for `[[` suggestions (P9-06). */
  linkTargets?: LinkTarget[];
  /** The edited document (not suggested). */
  documentId?: string;
}

/**
 * CodeMirror 6 Markdown source editor (PROJECT_SPEC §7, UI_SPEC §39–42): syntax highlighting,
 * optional line numbers, find & replace, undo/redo, Tab indentation, bracket handling, word wrap.
 */
export function SourceEditor({
  initialValue,
  onChange,
  onSave,
  onExit,
  lineNumbers: showLineNumbers = true,
  autoFocus = true,
  onUpload,
  linkTargets = [],
  documentId,
}: SourceEditorProps) {
  const host = useRef<HTMLDivElement>(null);
  // Keep the latest callbacks without recreating the editor.
  const callbacks = useRef({ onChange, onSave, onExit, onUpload, linkTargets });
  const attach = useRef<(files: File[]) => void>(() => undefined);
  useLayoutEffect(() => {
    callbacks.current = { onChange, onSave, onExit, onUpload, linkTargets };
  });

  useEffect(() => {
    if (!host.current) return;
    let alive = true;
    const pending = new Set<{ from: number; to: number }>();
    const upload = (files: File[]) => {
      if (!callbacks.current.onUpload) return;
      const anchor = { from: view.state.selection.main.from, to: view.state.selection.main.to };
      pending.add(anchor);
      void callbacks.current
        .onUpload(files)
        .then((markdown) => {
          if (alive && markdown)
            view.dispatch({ changes: { from: anchor.from, to: anchor.to, insert: markdown } });
        })
        .finally(() => pending.delete(anchor));
    };
    attach.current = upload;
    const extensions: Extension[] = [
      EditorView.domEventHandlers({
        paste: (event) => {
          const files = Array.from(event.clipboardData?.files ?? []);
          if (!files.length || !callbacks.current.onUpload) return false;
          event.preventDefault();
          upload(files);
          return true;
        },
        drop: (event, view) => {
          const files = Array.from(event.dataTransfer?.files ?? []);
          if (!files.length || !callbacks.current.onUpload) return false;
          event.preventDefault();
          const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
          if (pos != null) view.dispatch({ selection: { anchor: pos } });
          upload(files);
          return true;
        },
      }),
      history(),
      drawSelection(),
      dropCursor(),
      indentOnInput(),
      bracketMatching(),
      closeBrackets(),
      autocompletion({
        override: [wikiCompletions(() => callbacks.current.linkTargets, documentId)],
        icons: false,
      }),
      highlightSelectionMatches(),
      search({ top: true }),
      markdown({ base: markdownLanguage, codeLanguages: languages }),
      syntaxHighlighting(markdownHighlight),
      EditorView.lineWrapping,
      placeholder('Start writing Markdown…'),
      EditorView.contentAttributes.of({ 'aria-label': 'Markdown source', spellcheck: 'true' }),
      keymap.of([
        {
          key: 'Mod-s',
          preventDefault: true,
          run: () => {
            callbacks.current.onSave();
            return true;
          },
        },
        {
          key: 'Escape',
          run: (view) => {
            if (closeSearchPanel(view)) return true;
            callbacks.current.onExit();
            return true;
          },
        },
        { key: 'Mod-b', run: (view) => wrapSelection(view, '**') },
        { key: 'Mod-i', run: (view) => wrapSelection(view, '*') },
        ...closeBracketsKeymap,
        ...searchKeymap,
        ...historyKeymap,
        ...defaultKeymap,
        indentWithTab,
      ]),
      EditorView.updateListener.of((update) => {
        if (update.docChanged)
          for (const anchor of pending) {
            anchor.from = update.changes.mapPos(anchor.from, 1);
            anchor.to = Math.max(anchor.from, update.changes.mapPos(anchor.to, -1));
          }
        if (update.docChanged) callbacks.current.onChange(update.state.doc.toString());
      }),
    ];
    if (showLineNumbers) extensions.push(lineNumbers(), highlightActiveLineGutter());

    const view = new EditorView({
      state: EditorState.create({ doc: initialValue, extensions }),
      parent: host.current,
    });
    if (autoFocus) view.focus();
    return () => {
      alive = false;
      attach.current = () => undefined;
      view.destroy();
    };
    // initialValue/showLineNumbers are read once on mount by design (remount via `key`).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      {onUpload && <UploadControl onFiles={(files) => attach.current(files)} />}
      <div ref={host} className="source-editor" data-testid="source-editor" />
    </>
  );
}
