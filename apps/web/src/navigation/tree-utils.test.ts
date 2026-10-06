import { describe, expect, it } from 'vitest';
import { doc, folder, sampleTree } from '../test/render';
import { canDrop } from './NavigationTree';
import { clampWidth } from './NavigationSidebar';
import {
  ancestorFolders,
  collectFolders,
  countDocuments,
  findDocument,
  flattenVisible,
  isSameOrInside,
} from './tree-utils';

describe('tree utils', () => {
  it('flattens only expanded folders', () => {
    const tree = sampleTree();
    expect(flattenVisible(tree, new Set()).map((row) => row.node.path)).toEqual([
      'Infrastructure',
      'Network',
      'README.md',
    ]);
    const rows = flattenVisible(tree, new Set(['Infrastructure', 'Infrastructure/Servers']));
    expect(rows.map((row) => [row.node.path, row.level])).toEqual([
      ['Infrastructure', 1],
      ['Infrastructure/Servers', 2],
      ['Infrastructure/Servers/BUZHULK.md', 3],
      ['Infrastructure/Servers/BUZPI00.md', 3],
      ['Network', 1],
      ['README.md', 1],
    ]);
  });

  it('computes ancestors, folders and documents', () => {
    expect(ancestorFolders('A/B/C.md')).toEqual(['A', 'A/B']);
    expect(ancestorFolders('C.md')).toEqual([]);
    expect(collectFolders(sampleTree())).toEqual([
      '',
      'Infrastructure',
      'Infrastructure/Servers',
      'Network',
    ]);
    expect(findDocument(sampleTree(), 'id-vlan')?.path).toBe('Network/VLAN.md');
    expect(findDocument(sampleTree(), 'nope')).toBeUndefined();
    expect(countDocuments(sampleTree())).toBe(4);
    expect(isSameOrInside('A/B', 'A')).toBe(true);
    expect(isSameOrInside('AB', 'A')).toBe(false);
  });

  it('only allows meaningful drops', () => {
    const document = { kind: 'document', id: 'x', title: 'X', path: 'A/X.md' } as const;
    const folderTarget = { kind: 'folder', path: 'A/B', name: 'B' } as const;
    expect(canDrop(document, 'A')).toBe(false); // already there
    expect(canDrop(document, '')).toBe(true);
    expect(canDrop(folderTarget, 'A/B/C')).toBe(false); // into itself
    expect(canDrop(folderTarget, 'A/B')).toBe(false);
    expect(canDrop(folderTarget, 'C')).toBe(true);
    expect(folder('X').children).toEqual([]);
    expect(doc('a.md', '1').type).toBe('document');
  });

  it('clamps the sidebar width to 220–400 px', () => {
    expect(clampWidth(100)).toBe(220);
    expect(clampWidth(300.4)).toBe(300);
    expect(clampWidth(900)).toBe(400);
  });
});
