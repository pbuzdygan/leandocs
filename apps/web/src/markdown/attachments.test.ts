import { describe, expect, it } from 'vitest';
import { parseMarkdown } from '@leandocs/shared';
import { applyRenderContext, resolveAttachmentUrl } from './links';

const context = {
  documentPath: 'Folder/Doc.md',
  documents: [
    { id: 'own', title: 'Doc', path: 'Folder/Doc.md' },
    { id: 'other', title: 'Other Doc', path: 'Other Doc.md' },
  ],
};
describe('portable attachment URLs', () => {
  it('resolves local and cross-document images, links and references', () => {
    expect(resolveAttachmentUrl('Doc.assets/shot.png', context)).toBe(
      '/api/v1/documents/own/attachments/shot.png',
    );
    expect(resolveAttachmentUrl('../Other%20Doc.assets/a%20b.txt', context)).toBe(
      '/api/v1/documents/other/attachments/a%20b.txt',
    );
    const tree = parseMarkdown(
      '![shot](Doc.assets/shot.png)\n\n[file](Doc.assets/a.txt)\n\n![ref][shot]\n\n[shot]: Doc.assets/shot.png',
    );
    applyRenderContext(tree, context);
    expect(JSON.stringify(tree)).toContain('/api/v1/documents/own/attachments/shot.png');
    expect(JSON.stringify(tree)).toContain('/api/v1/documents/own/attachments/a.txt');
  });
  it('does not reinterpret external, unsafe or unrelated paths', () => {
    for (const url of [
      'https://example.com/Doc.assets/x.png',
      '//example.com/x',
      '../../../Doc.assets/x',
      '%zz',
      'Missing.assets/x.png',
      'javascript:alert(1)',
      'Doc.assets/sub/x',
    ])
      expect(resolveAttachmentUrl(url, context)).toBe(url);
  });
});
