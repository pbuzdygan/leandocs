import { describe, expect, it } from 'vitest';
import {
  createLinkResolver,
  extractLinks,
  relativePath,
  resolveRelativePath,
  wikiKeys,
} from './links.js';
import { parseMarkdown } from './markdown/parse.js';

describe('extractLinks (P9-01)', () => {
  it('finds wiki links and relative Markdown document links only', () => {
    const links = extractLinks(
      parseMarkdown(
        [
          'See [[BUZHULK]], [[BUZHULK#Hardware]] and [[Home Assistant|HA]].',
          '[UniFi](../Network/UniFi%20Controller.md#vlans) and [ref][r].',
          '[web](https://example.com/a.md) [abs](/x.md) [anchor](#top) ![img](a.assets/x.png)',
          '[asset](Doc.assets/file.pdf)',
          '',
          '[r]: Other.md',
          '',
          '```',
          '[[Not a link]]',
          '```',
        ].join('\n'),
      ),
    );
    expect(links).toEqual([
      { kind: 'wiki', target: 'BUZHULK' },
      { kind: 'wiki', target: 'BUZHULK', heading: 'Hardware' },
      { kind: 'wiki', target: 'Home Assistant', alias: 'HA' },
      {
        kind: 'markdown',
        href: '../Network/UniFi%20Controller.md#vlans',
        path: '../Network/UniFi Controller.md',
        fragment: 'vlans',
      },
      { kind: 'markdown', href: 'Other.md', path: 'Other.md' },
    ]);
  });
});

describe('createLinkResolver (P9-02)', () => {
  const docs = [
    { id: 'a', title: 'BUZHULK', path: 'Infrastructure/Servers/BUZHULK.md', aliases: ['hulk'] },
    { id: 'b', title: 'Home Assistant', path: 'Applications/HA.md' },
    { id: 'c', title: 'Something else', path: 'Applications/Home Assistant.md' },
    { id: 'd', title: 'Hulk', path: 'Zoo/Hulk.md' },
  ];
  const resolver = createLinkResolver(docs);

  it('resolves wiki links by title, alias, file name and path, title first', () => {
    expect(resolver.wiki('buzhulk')?.id).toBe('a');
    expect(resolver.wiki('Home Assistant')?.id).toBe('b'); // title beats another file's name
    expect(resolver.wiki('HA')?.id).toBe('b'); // file name
    expect(resolver.wiki('hulk')?.id).toBe('d'); // a title beats an alias
    expect(resolver.wiki('Infrastructure/Servers/BUZHULK')?.id).toBe('a');
    expect(resolver.wiki('Missing')).toBeUndefined();
  });

  it('resolves relative Markdown links from the source folder', () => {
    expect(
      resolver.resolve(
        { kind: 'markdown', href: '', path: '../Infrastructure/Servers/BUZHULK.md' },
        'Applications/HA.md',
      )?.id,
    ).toBe('a');
    expect(
      resolver.resolve({ kind: 'markdown', href: '', path: '../../x.md' }, 'Applications/HA.md'),
    ).toBeUndefined();
  });

  it('lists every key a wiki link could use', () => {
    expect(wikiKeys(docs[0]!).sort()).toEqual(
      [
        'buzhulk',
        'hulk',
        'infrastructure/servers/buzhulk',
        'infrastructure/servers/buzhulk.md',
      ].sort(),
    );
  });
});

describe('paths', () => {
  it('computes relative paths both ways', () => {
    expect(relativePath('Applications/HA.md', 'Infrastructure/Network/UniFi.md')).toBe(
      '../Infrastructure/Network/UniFi.md',
    );
    expect(relativePath('A/B/Doc.md', 'A/B/Other.md')).toBe('Other.md');
    expect(relativePath('Doc.md', 'A/Other.md')).toBe('A/Other.md');
    expect(relativePath('A/Doc.md', 'Other.md')).toBe('../Other.md');
    expect(resolveRelativePath('A/B', '../C/x.md')).toBe('A/C/x.md');
  });
});
