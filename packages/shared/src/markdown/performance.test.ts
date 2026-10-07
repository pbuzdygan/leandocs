import { describe, expect, it } from 'vitest';
import { extractPlainText, parseMarkdown } from './parse.js';

function repeat(make: (index: number) => string, bytes: number): string {
  let text = '';
  for (let index = 0; text.length < bytes; index++) text += make(index);
  return text;
}

/**
 * Many block containers (quotes, list items) in one document made the Markdown parser quadratic:
 * 100 KiB of short quotes took ~7 s and large documents ran out of memory. The fix is a local
 * patch to `micromark-util-edit-map` (`patches/`, ADR-0025). Before it, each case below took
 * several seconds; the limit leaves room for slow CI machines.
 */
describe('Markdown parser performance', () => {
  it.each([
    ['separate quotes', (index: number) => `> quote ${index}\n\n`, 'quote 0'],
    ['nested list items', (index: number) => `- item ${index}\n  - nested\n\n`, 'item 0'],
  ])('parses 100 KiB of %s in linear time', (_name, make, first) => {
    const text = repeat(make, 100 * 1024);
    const start = performance.now();
    const tree = parseMarkdown(text);
    const elapsed = performance.now() - start;
    expect(extractPlainText(tree)).toContain(first);
    expect(elapsed).toBeLessThan(3000);
  });
});
