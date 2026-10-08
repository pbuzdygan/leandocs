import { describe, expect, it } from 'vitest';
import { tocEntries } from './ContextSidebar';

const h = (depth: number, text: string) => ({ id: text, depth, text });

describe('tocEntries', () => {
  it('includes H1 and nests by outline, not by raw depth', () => {
    const entries = tocEntries([
      h(1, 'Overview'),
      h(2, 'Hardware'),
      h(3, 'Disks'),
      h(1, 'Network'),
      h(3, 'VLANs'),
      h(5, 'Too deep'),
      h(2, 'Firewall'),
    ]);
    expect(entries.map((entry) => [entry.text, entry.level])).toEqual([
      ['Overview', 0],
      ['Hardware', 1],
      ['Disks', 2],
      ['Network', 0],
      ['VLANs', 1],
      ['Firewall', 1],
    ]);
  });

  it('starts at level 0 when the document has no H1', () => {
    expect(tocEntries([h(2, 'A'), h(3, 'B'), h(2, 'C')]).map((entry) => entry.level)).toEqual([
      0, 1, 0,
    ]);
  });
});
