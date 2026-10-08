import { describe, expect, it, vi } from 'vitest';
import { editorViewCtx } from '@milkdown/kit/core';
import { parseMarkdown } from '@leandocs/shared';
import { createVisualEditor } from './create-editor';
import { safeEditorUrl } from './preservation';

const fixtures = {
  formatting:
    '# Title\n\n**Bold**, *italic*, ~~removed~~ and `code`.\n\n> Quote\n\n1. First\n2. Second\n\n---',
  images: '![Screenshot](Doc.assets/screenshot.png)\n\n![](Doc.assets/image.png "Title")',
  table: '| Name | Value |\n| :--- | ---: |\n| host | 42 |',
  tasks: '- [x] Done\n- [ ] Pending',
  code: '```yaml\n# comment\nservices:\n  demo: "yes"\n```',
  mermaid: '```mermaid\nflowchart LR\n    A --> B\n```',
  callouts:
    ':::warning\nKeep **this** exactly.\n:::\n\n:::custom{key="value"}\nUnknown block.\n:::',
  wiki: 'See [[Server#Hardware|host]] and [[Network]].',
  html: '<div onclick="alert(1)">\n<script>window.__xss = true</script>\n</div>\n\nInline <b data-custom="keep">HTML</b>.',
  references: '[A reference][target]\n\n[target]: ../Original.md "Title"',
};

function semantics(source: string): unknown {
  return JSON.parse(
    JSON.stringify(parseMarkdown(source), (key, value: unknown) =>
      key === 'position' ? undefined : value,
    ),
  );
}

describe('Source → Visual → edit → Source fixtures', () => {
  for (const [name, fixture] of Object.entries(fixtures)) {
    it(`preserves ${name} while another paragraph changes`, async () => {
      const source = `${fixture}\n\nEditable paragraph.\n`;
      let output = source;
      const root = document.createElement('div');
      document.body.append(root);
      const editor = await createVisualEditor({
        root,
        source,
        onChange: (value) => {
          output = value;
        },
        onSave: () => undefined,
        onExit: () => undefined,
      });
      try {
        expect(output).toBe(source); // Opening Visual must not trigger a normalising save.
        editor.action((ctx) => {
          const view = ctx.get(editorViewCtx);
          view.dispatch(view.state.tr.insertText(' Edited.', view.state.doc.content.size - 1));
        });
        expect(output).toContain(fixture);
        expect(semantics(output)).toEqual(semantics(`${fixture}\n\nEditable paragraph. Edited.\n`));
        expect(root.querySelector('script, [onclick]')).toBeNull();
      } finally {
        await editor.destroy();
        root.remove();
      }
    });
  }
  it('blocks active URL schemes including control-character obfuscation', () => {
    for (const url of [
      'javascript:alert(1)',
      'java\nscript:alert(1)',
      'data:text/html,test',
      'vbscript:foo',
    ])
      expect(safeEditorUrl(url)).toBe('');
    expect(safeEditorUrl('../Doc.md')).toBe('../Doc.md');
    expect(safeEditorUrl('https://example.com')).toBe('https://example.com');
  });
});

it('inserts uploaded images using portable source URLs and resolved DOM URLs', async () => {
  const root = document.createElement('div');
  document.body.append(root);
  let upload: (files: File[]) => void = () => undefined;
  let output = 'Tail.';
  const editor = await createVisualEditor({
    root,
    source: output,
    onChange: (value) => {
      output = value;
    },
    onSave: () => undefined,
    onExit: () => undefined,
    onUpload: async () => '![screenshot.png](Attachments%20Visual.assets/screenshot.png)',
    onUploadReady: (callback) => {
      upload = callback;
    },
    resolveUrl: () => '/api/v1/documents/test/attachments/screenshot.png',
  });
  try {
    upload([new File(['x'], 'screenshot.png')]);
    await vi.waitFor(() => expect(root.querySelector('img[src]')).not.toBeNull());
    expect(output).toContain('Attachments%20Visual.assets/screenshot.png');
    expect(root.querySelector('img[src]')?.getAttribute('src')).toBe(
      '/api/v1/documents/test/attachments/screenshot.png',
    );
  } finally {
    await editor.destroy();
    root.remove();
  }
});

it('does not steal focus from actions opened while the visual editor loads', async () => {
  const root = document.createElement('div');
  const button = document.createElement('button');
  document.body.append(root, button);
  button.focus();
  const editor = await createVisualEditor({
    root,
    source: 'Text',
    onChange: () => undefined,
    onSave: () => undefined,
    onExit: () => undefined,
  });
  try {
    expect(document.activeElement).toBe(button);
  } finally {
    await editor.destroy();
    root.remove();
    button.remove();
  }
});
