import { createLinkResolver } from '@leandocs/shared';
import { describe, expect, it } from 'vitest';
import {
  documentMoves,
  mapPath,
  rewriteRelativeLinks,
  rewriteWikiTargets,
} from './link-updater.js';

const always = () => true;

describe('mapPath', () => {
  it('maps documents exactly and folders by prefix', () => {
    const moves = [
      ...documentMoves('A/Old.md', 'B/New.md'),
      { from: 'F/', to: 'G/F/', prefix: true },
    ];
    expect(mapPath('A/Old.md', moves)).toBe('B/New.md');
    expect(mapPath('A/Old.assets/x.png', moves)).toBe('B/New.assets/x.png');
    expect(mapPath('F/sub/doc.md', moves)).toBe('G/F/sub/doc.md');
    expect(mapPath('A/Other.md', moves)).toBeUndefined();
  });
});

describe('rewriteRelativeLinks', () => {
  // Cases carried over from the former own-asset rename (Phase 7).
  it('follows renamed attachments and changes only destinations', () => {
    const source =
      'Old.assets/a.png\n\n![Old.assets/a.png](Old.assets/a.png "title")\n\n[download](./Old.assets/note.txt)\n\n[shot]: Old.assets/a.png\n\n`![x](Old.assets/a.png)`\n\n```md\n![x](Old.assets/a.png)\n```\n';
    const moves = documentMoves('Folder/Old.md', 'Folder/New Doc.md');
    expect(rewriteRelativeLinks(source, 'Folder/Old.md', 'Folder/New Doc.md', moves, always)).toBe(
      source
        .replace('(Old.assets/a.png "title")', '(New%20Doc.assets/a.png "title")')
        .replace('(./Old.assets/note.txt)', '(./New%20Doc.assets/note.txt)')
        .replace('[shot]: Old.assets/a.png', '[shot]: New%20Doc.assets/a.png'),
    );
    expect(
      rewriteRelativeLinks(
        '![x](Old.assets%2Fa.png)',
        'Old.md',
        'New.md',
        documentMoves('Old.md', 'New.md'),
        always,
      ),
    ).toBe('![x](New.assets/a.png)');
    expect(
      rewriteRelativeLinks(
        '![x](Old%20Name.assets/a.png)',
        'Old Name.md',
        'New.md',
        documentMoves('Old Name.md', 'New.md'),
        always,
      ),
    ).toBe('![x](New.assets/a.png)');
  });

  it('re-points links to a moved document and keeps fragments and angle brackets', () => {
    const moves = documentMoves('Network/UniFi.md', 'Infrastructure/Network/UniFi.md');
    const body =
      '[a](../Network/UniFi.md#vlans) [b](<../Network/UniFi.md>) [c](https://x/Network/UniFi.md) [d](../Network/Other.md)\n';
    expect(rewriteRelativeLinks(body, 'Apps/HA.md', 'Apps/HA.md', moves, always)).toBe(
      '[a](../Infrastructure/Network/UniFi.md#vlans) [b](<../Infrastructure/Network/UniFi.md>) [c](https://x/Network/UniFi.md) [d](../Network/Other.md)\n',
    );
  });

  it('rebases the moved document’s own links, leaving broken ones alone', () => {
    const moves = documentMoves('Apps/HA.md', 'Deep/Apps/HA.md');
    const body = '[ok](../Network/UniFi.md) [gone](../Gone.md) ![](HA.assets/x.png) [self](#top)\n';
    const exists = (relative: string) => relative !== 'Gone.md';
    expect(rewriteRelativeLinks(body, 'Apps/HA.md', 'Deep/Apps/HA.md', moves, exists)).toBe(
      '[ok](../../Network/UniFi.md) [gone](../Gone.md) ![](HA.assets/x.png) [self](#top)\n',
    );
  });
});

describe('rewriteWikiTargets', () => {
  const before = [
    { id: 'u', title: 'UniFi', path: 'Network/UniFi.md' },
    { id: 's', title: 'Switch config', path: 'Network/sw01.md' },
  ];
  const after = [
    { id: 'u', title: 'UniFi', path: 'Network/UniFi Controller.md' },
    { id: 's', title: 'Switch config', path: 'Infra/sw01-core.md' },
  ];
  const run = (body: string) =>
    rewriteWikiTargets(body, createLinkResolver(before), createLinkResolver(after), (id) =>
      after.find((document) => document.id === id),
    );

  it('keeps title links and rewrites file-name and path links that would break', () => {
    expect(run('[[UniFi]] [[sw01#Ports|ports]] [[Network/sw01]] [[Missing]]\n')).toBe(
      '[[UniFi]] [[Switch config#Ports|ports]] [[Infra/sw01-core]] [[Missing]]\n',
    );
  });

  it('never touches code', () => {
    expect(run('`[[sw01]]`\n\n```\n[[sw01]]\n```\n')).toBe('`[[sw01]]`\n\n```\n[[sw01]]\n```\n');
  });
});
