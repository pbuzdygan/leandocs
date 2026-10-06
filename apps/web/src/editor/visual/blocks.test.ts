import { commandsCtx, editorViewCtx, type Editor } from '@milkdown/kit/core';
import {
  addColAfterCommand,
  addRowAfterCommand,
  insertTableCommand,
} from '@milkdown/kit/preset/gfm';
import { TextSelection } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';
import { afterEach, describe, expect, it } from 'vitest';
import { blockContext, wikiSource } from './blocks';
import { createVisualEditor } from './create-editor';

/** Owner feedback 2026-10-02: callouts, code blocks and tables in the visual editor. */

const open: { editor: Editor; root: HTMLElement }[] = [];
afterEach(async () => {
  for (const { editor, root } of open.splice(0)) {
    await editor.destroy();
    root.remove();
  }
});

async function start(source: string) {
  const root = document.createElement('div');
  document.body.append(root);
  const result = { output: source, editor: undefined as unknown as Editor };
  result.editor = await createVisualEditor({
    root,
    source,
    onChange: (value) => {
      result.output = value;
    },
    onSave: () => undefined,
    onExit: () => undefined,
  });
  open.push({ editor: result.editor, root });
  return {
    ...result,
    root,
    get output() {
      return result.output;
    },
  };
}

function withView<T>(editor: Editor, run: (view: EditorView) => T): T {
  let value: T | undefined;
  editor.action((ctx) => {
    value = run(ctx.get(editorViewCtx));
  });
  return value as T;
}

/** Position right after the first occurrence of `text` in the document. */
function after(view: EditorView, text: string): number {
  let found = -1;
  view.state.doc.descendants((node, pos) => {
    if (found !== -1 || !node.isText) return found === -1;
    const index = node.text!.indexOf(text);
    if (index !== -1) found = pos + index + text.length;
    return false;
  });
  if (found === -1) throw new Error(`text not found: ${text}`);
  return found;
}

function press(view: EditorView, key: string) {
  view.dom.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

describe('callouts (P6-10)', () => {
  it('are editable nodes and serialize back to the directive', async () => {
    const editor = await start(':::warning\nKeep this.\n:::\n\nTail.\n');
    expect(editor.root.querySelector('.callout--warning .callout__body')).not.toBeNull();
    expect(editor.root.querySelector('[data-preserved]')).toBeNull();
    withView(editor.editor, (view) =>
      view.dispatch(view.state.tr.insertText(' Edited', after(view, 'Keep this'))),
    );
    expect(editor.output).toBe(':::warning\nKeep this Edited.\n:::\n\nTail.\n');
  });

  it('keep a [label] as the title and can change type', async () => {
    const editor = await start(':::tip[Heads up]\nBody\n:::\n');
    expect(editor.root.querySelector('.callout__title')?.textContent).toBe('Heads up');
    withView(editor.editor, (view) => {
      let pos = -1;
      view.state.doc.descendants((node, p) => {
        if (node.type.name === 'callout') pos = p;
      });
      view.dispatch(view.state.tr.setNodeAttribute(pos, 'kind', 'danger'));
    });
    expect(editor.output).toBe(':::danger[Heads up]\nBody\n:::\n');
  });

  it('stay preserved when they carry attributes or unsupported content', async () => {
    const editor = await start(':::note{.x}\nAttr\n:::\n\n:::info\n<b>raw</b>\n:::\n');
    expect(editor.root.querySelectorAll('[data-preserved]')).toHaveLength(2);
    expect(editor.root.querySelector('.callout')).toBeNull();
  });

  it('are inserted empty with the caret inside from the toolbar command path', async () => {
    const editor = await start('Text\n');
    withView(editor.editor, (view) => {
      const callout = view.state.schema.nodes.callout!.create(
        { kind: 'note' },
        view.state.schema.nodes.paragraph!.create(),
      );
      view.dispatch(view.state.tr.insert(view.state.doc.content.size, callout));
      view.dispatch(view.state.tr.insertText('New note', view.state.doc.content.size - 2));
    });
    expect(editor.output).toBe('Text\n\n:::note\nNew note\n:::\n');
  });
});

describe('code blocks (P6-08, P6-11)', () => {
  it('Enter twice at the end leaves the block without keeping the empty line', async () => {
    const editor = await start('```bash\necho hi\n```\n');
    withView(editor.editor, (view) => {
      view.dispatch(
        view.state.tr.setSelection(TextSelection.create(view.state.doc, after(view, 'echo hi'))),
      );
      view.focus();
      press(view, 'Enter'); // new line inside the code block
      press(view, 'Enter'); // empty last line → leave the block
      view.dispatch(view.state.tr.insertText('After code.'));
    });
    expect(editor.output).toBe('```bash\necho hi\n```\n\nAfter code.\n');
  });

  it('can change the language, which is highlighted in Visual', async () => {
    const editor = await start('```\nkey: value\n```\n');
    expect(editor.root.querySelector('pre.code-block')?.getAttribute('data-language')).toBe('');
    withView(editor.editor, (view) => {
      let pos = -1;
      view.state.doc.descendants((node, p) => {
        if (node.type.name === 'code_block') pos = p;
      });
      view.dispatch(view.state.tr.setNodeAttribute(pos, 'language', 'yaml'));
    });
    expect(editor.output).toBe('```yaml\nkey: value\n```\n');
    expect(editor.root.querySelector('pre.code-block [class*="hljs-attr"]')?.textContent).toMatch(
      /^key/,
    );
  });
});

describe('tables (P6-09)', () => {
  it('insert 3×3 and grow by rows and columns', async () => {
    const editor = await start('Start\n');
    editor.editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      view.dispatch(
        view.state.tr.setSelection(TextSelection.create(view.state.doc, after(view, 'Start'))),
      );
      ctx.get(commandsCtx).call(insertTableCommand.key, { row: 3, col: 3 });
      let cell = -1;
      view.state.doc.descendants((node, pos) => {
        if (cell === -1 && node.type.name === 'table_header') cell = pos;
      });
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, cell + 2)));
      expect(blockContext(view.state).table).toEqual({ headerRow: true });
      ctx.get(commandsCtx).call(addRowAfterCommand.key);
      ctx.get(commandsCtx).call(addColAfterCommand.key);
    });
    const rows = editor.output.split('\n').filter((line) => line.startsWith('|'));
    expect(rows).toHaveLength(5); // header, delimiter, 3 body rows
    expect(rows[0]!.split('|').length - 2).toBe(4);
  });
});

describe('wiki links in Visual (P9-06)', () => {
  it('are inline nodes: their paragraph stays editable and they are written back verbatim', async () => {
    const editor = await start('See [[Home Assistant#Net|HA]] and [[UniFi]].\n');
    expect(editor.root.querySelector('[data-preserved]')).toBeNull();
    expect([...editor.root.querySelectorAll('.wiki-link')].map((el) => el.textContent)).toEqual([
      'HA',
      'UniFi',
    ]);
    withView(editor.editor, (view) => view.dispatch(view.state.tr.insertText('Also: ', 1)));
    expect(editor.output).toBe('Also: See [[Home Assistant#Net|HA]] and [[UniFi]].\n');
  });

  it('turn typed [[Target]] into a link when closed', async () => {
    const editor = await start('Start\n');
    withView(editor.editor, (view) => {
      const end = after(view, 'Start');
      const tr = view.state.tr.insertText(' [[Backup]', end);
      const pos = end + ' [[Backup]'.length;
      view.dispatch(tr.setSelection(TextSelection.create(tr.doc, pos)));
      const handled = view.someProp('handleTextInput', (f) =>
        f(view, pos, pos, ']', () => view.state.tr.insertText(']', pos, pos)),
      );
      expect(handled).toBe(true);
    });
    expect(editor.output).toBe('Start [[Backup]]\n');
    expect(editor.root.querySelector('.wiki-link')?.textContent).toBe('Backup');
  });

  it('write no-break spaces typed next to links as plain spaces', async () => {
    const editor = await start('A [[B]]\n');
    withView(editor.editor, (view) =>
      view.dispatch(view.state.tr.insertText('\u00a0x', view.state.doc.content.size - 1)),
    );
    expect(editor.output).toBe('A [[B]] x\n');
  });

  it('report the `[[` query for the link picker', async () => {
    const editor = await start('Start\n');
    withView(editor.editor, (view) => {
      const end = after(view, 'Start');
      const tr = view.state.tr.insertText(' [[hom', end);
      view.dispatch(tr.setSelection(TextSelection.create(tr.doc, end + ' [[hom'.length)));
      expect(blockContext(view.state).wiki).toBe('hom');
    });
  });

  it('serialize to a single safe token', () => {
    expect(wikiSource({ target: 'A]]<b>', heading: 'x|y#z', alias: 'Label]' })).toBe(
      '[[Ab#xyz|Label]]',
    );
  });
});
