import type { Link, Paragraph, Root } from 'mdast';
import { toString } from 'mdast-util-to-string';
import { describe, expect, it } from 'vitest';
import { extractHeadings, extractPlainText, parseMarkdown } from './parse.js';

function links(tree: Root): Link[] {
  const result: Link[] = [];
  const walk = (node: { type: string; children?: unknown[] }) => {
    if (node.type === 'link') result.push(node as Link);
    for (const child of (node.children ?? []) as { type: string }[]) walk(child);
  };
  walk(tree);
  return result;
}

describe('parseMarkdown', () => {
  it('supports GFM: tables, task lists, strikethrough, autolinks', () => {
    const tree = parseMarkdown(
      '| a | b |\n|---|---|\n| 1 | 2 |\n\n- [x] done\n\n~~old~~ https://example.com\n',
    );
    expect(tree.children.map((node) => node.type)).toEqual(['table', 'list', 'paragraph']);
    expect(links(tree)[0]?.url).toBe('https://example.com');
  });

  it('turns known container directives into callouts with a default title', () => {
    const tree = parseMarkdown(':::warning\nDo not enable Secure Boot.\n:::\n');
    const callout = tree.children[0]!;
    expect(callout.type).toBe('containerDirective');
    expect(callout.data).toMatchObject({
      hName: 'div',
      hProperties: { className: ['callout', 'callout--warning'], dataCallout: 'warning' },
    });
    const [title, body] = (callout as { children: Paragraph[] }).children;
    expect(toString(title)).toBe('Warning');
    expect(toString(body)).toBe('Do not enable Secure Boot.');
  });

  it('uses a custom callout label', () => {
    const tree = parseMarkdown(':::danger[Data loss]\nBe careful.\n:::\n');
    const [title] = (tree.children[0] as { children: Paragraph[] }).children;
    expect(toString(title)).toBe('Data loss');
    expect(title?.data?.hProperties).toEqual({ className: ['callout__title'] });
  });

  it('keeps technical text that looks like directives literally', () => {
    const source = 'Use image vaultwarden/server:latest on host:8080, see :note and ::leaf.\n';
    expect(toString(parseMarkdown(source))).toBe(source.trim());
    const block = parseMarkdown('::not-a-callout\n');
    expect(toString(block)).toBe('::not-a-callout');
    const unknown = parseMarkdown(':::custom\ntext\n:::\n');
    expect(toString(unknown)).toBe(':::custom\ntext\n:::');
  });

  it('parses wiki links with heading and alias', () => {
    const tree = parseMarkdown('See [[BUZHULK]], [[VLAN#IoT]] and [[Home Assistant|HA]].\n');
    expect(links(tree).map((link) => [link.data?.wikiLink, toString(link)])).toEqual([
      [{ target: 'BUZHULK' }, 'BUZHULK'],
      [{ target: 'VLAN', heading: 'IoT' }, 'VLAN › IoT'],
      [{ target: 'Home Assistant', alias: 'HA' }, 'HA'],
    ]);
    expect(toString(tree)).toBe('See BUZHULK, VLAN › IoT and HA.');
  });

  it('ignores wiki-link syntax inside code', () => {
    const tree = parseMarkdown('`[[not a link]]`\n\n```\n[[nope]]\n```\n');
    expect(links(tree)).toEqual([]);
  });

  it('extracts headings', () => {
    expect(extractHeadings(parseMarkdown('# A\n\n## B *x*\n\ntext\n\n### C\n'))).toEqual([
      { depth: 1, text: 'A' },
      { depth: 2, text: 'B x' },
      { depth: 3, text: 'C' },
    ]);
  });
});

describe('extractPlainText', () => {
  it('keeps blocks on separate lines and leaves headings and markup out', () => {
    const text = extractPlainText(
      parseMarkdown(
        [
          '# Title',
          '',
          'First **bold** paragraph with `code` and <b>inline</b> html.',
          '',
          '- item one',
          '- item two',
          '',
          '| a | b |',
          '| - | - |',
          '| c | d |',
          '',
          ':::warning',
          'Careful macvlan',
          ':::',
          '',
          '```sh',
          'docker ps',
          '```',
          '',
          '<div onclick="x">raw <b>html</b></div>',
        ].join('\n'),
      ),
    );
    expect(text.split('\n')).toEqual([
      'First bold paragraph with code and inline html.',
      'item one',
      'item two',
      'a',
      'b',
      'c',
      'd',
      'Careful macvlan',
      'docker ps',
      'raw html',
    ]);
  });
});
