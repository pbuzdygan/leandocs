import { describe, expect, it } from 'vitest';
import { htmlImporter } from './html.js';
import { ImportItemError, type ScannedDocument } from './importer.js';

function convert(html: string | Buffer, source = 'note.html') {
  const item: ScannedDocument = {
    kind: 'document',
    source,
    target: source.replace(/\.html?$/, '.md'),
    bytes: Buffer.isBuffer(html) ? html : Buffer.from(html),
  };
  return htmlImporter.convert(item);
}

describe('HTML importer (PROJECT_SPEC §68)', () => {
  it('converts common HTML to Markdown and takes the title from <title>', () => {
    const result = convert(`<!doctype html><html><head><title> Old  note </title>
      <style>p { color: red }</style><script>alert(1)</script></head><body>
      <h1>Heading</h1><p>Hello <b>bold</b> <i>it</i> &amp; *stars*</p>
      <ul><li>one</li><li><input type="checkbox" checked> done</li></ul>
      <table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>
      <pre><code class="language-bash">echo hi</code></pre>
      <blockquote>quote</blockquote><del>gone</del><hr></body></html>`);
    expect(result.converted).toBe(true);
    expect(result.warnings).toEqual([]);
    expect(result.text).toBe(
      [
        '---',
        'title: Old note',
        '---',
        '',
        '# Heading',
        '',
        'Hello **bold** *it* & \\*stars\\*',
        '',
        '- one',
        '- [x] done',
        '',
        '| A | B |',
        '| - | - |',
        '| 1 | 2 |',
        '',
        '```bash',
        'echo hi',
        '```',
        '',
        '> quote',
        '',
        '~~gone~~',
        '',
        '---',
        '',
      ].join('\n'),
    );
  });

  it('reports everything that could not be converted safely', () => {
    const result = convert(`<p style="color:red">Text <u>under</u> <mark>m</mark> H<sub>2</sub>O</p>
      <script>steal()</script><iframe src="https://example.com"></iframe><iframe></iframe>
      <form><input type="text"></form>
      <a href="javascript:alert(1)">click</a> <a href="https://example.com">safe</a>
      <img src="data:image/png;base64,AAAA" alt="Inline chart"> <img src="pics/diagram.png" alt="D">
      <img src="https://example.com/remote.png" alt="R">
      <table><tr><td colspan="2">merged</td></tr></table>
      <details><summary>More</summary>hidden text</details>`);
    expect(result.warnings).toEqual([
      'Removed a script that Markdown cannot contain',
      'Removed 2 embedded pages that Markdown cannot contain',
      'Removed a form that Markdown cannot contain',
      'Removed an image stored inside the HTML; only the description text was kept',
      'Images are not imported yet; the document still refers to pics/diagram.png',
      'Removed a link that could run code; the link text was kept',
      'A table with merged cells was simplified',
      'Formatting Markdown does not support was removed: collapsible section, highlight, subscript, underline',
      'Colours, fonts and other styles were removed',
    ]);
    expect(result.text).not.toMatch(/steal|javascript|data:|iframe|<script/);
    expect(result.text).toContain('click [safe](https://example.com)');
    expect(result.text).toContain('Inline chart ![D](pics/diagram.png)');
    expect(result.text).toContain('![R](https://example.com/remote.png)');
    expect(result.text).toContain('hidden text');
  });

  it('points relative links to other HTML pages at the converted Markdown files', () => {
    const result = convert(
      '<a href="other.html">a</a> <a href="../dir/page.htm#part">b</a> <a href="https://x.org/y.html">c</a>',
    );
    expect(result.text).toBe('[a](other.md) [b](../dir/page.md#part) [c](https://x.org/y.html)\n');
    expect(result.notes).toEqual([
      'Links to 2 HTML pages now point to the converted Markdown file',
    ]);
  });

  it('decodes the declared character encoding and falls back to Windows-1252 with a warning', () => {
    const polish = Buffer.concat([
      Buffer.from('<meta charset="windows-1250"><p>'),
      Buffer.from([0x9c, 0xb9, 0xbf]), // śąż
      Buffer.from('</p>'),
    ]);
    expect(convert(polish).text).toBe('śąż\n');
    const legacy = convert(Buffer.from([0x63, 0x61, 0x66, 0xe9])); // "café" without a declaration
    expect(legacy.text).toBe('café\n');
    expect(legacy.warnings[0]).toMatch(/does not declare its character encoding/);
    expect(convert(Buffer.from('﻿<p>zażółć</p>')).text).toBe('zażółć\n');
    expect(() => convert('<meta charset="x-unknown-encoding"><p>x</p>')).toThrow(ImportItemError);
  });

  it('scans only HTML files and maps them to Markdown paths', () => {
    const items = htmlImporter.scan([
      { path: 'Export/Page.HTML', size: 3, bytes: Buffer.from('<p>') },
      { path: 'Export/notes.md', size: 3, bytes: Buffer.from('# x') },
      { path: 'Export/.cache/x.html', size: 3, bytes: Buffer.from('<p>') },
      { path: 'Export/Big.htm', size: 1, tooLarge: true },
    ]);
    expect(
      items.map((item) => [item.source, item.kind === 'document' ? item.target : item.reason]),
    ).toEqual([
      ['Export/.cache/x.html', 'Hidden or attachment file'],
      ['Export/Big.htm', 'Larger than 10 MiB'],
      ['Export/Page.HTML', 'Export/Page.md'],
      ['Export/notes.md', 'Only HTML files are converted'],
    ]);
    expect(htmlImporter.detect([{ path: 'a.md', size: 1 }])).toBe(false);
  });
});
