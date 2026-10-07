import { describe, expect, it } from 'vitest';
import { buildSnippet, snippetTerms } from './snippet.js';

const text = (parts: { text: string }[]) => parts.map((part) => part.text).join('');
const marked = (parts: { text: string; match: boolean }[]) =>
  parts.filter((part) => part.match).map((part) => part.text);

describe('buildSnippet', () => {
  it('marks whole words matched by a prefix, ignoring case and accents', () => {
    const parts = buildSnippet('Nginx in front of Zażółć.', snippetTerms(['ngi', 'zazol'], []));
    expect(marked(parts)).toEqual(['Nginx', 'Zażółć']);
    expect(text(parts)).toBe('Nginx in front of Zażółć');
  });

  it('marks a quoted phrase as one match and only in that order', () => {
    const terms = snippetTerms([], ['proxy manager']);
    expect(marked(buildSnippet('nginx proxy manager here', terms))).toEqual(['proxy manager']);
    expect(marked(buildSnippet('manager proxy', terms))).toEqual([]);
  });

  it('shows a window around the first match with ellipses', () => {
    const words = Array.from({ length: 40 }, (_, index) => `w${index}`);
    words[20] = 'target';
    const parts = buildSnippet(words.join(' '), snippetTerms(['target'], []));
    expect(text(parts)).toBe(`…${words.slice(16, 32).join(' ')}…`);
  });

  it('falls back to the beginning when the body does not contain the words', () => {
    expect(text(buildSnippet('only the title matched', snippetTerms(['other'], [])))).toBe(
      'only the title matched',
    );
  });

  it('stays fast with tens of thousands of matches', () => {
    const body = 'Plain words about the zebracorn appliance. '.repeat(64_000);
    const start = performance.now();
    expect(marked(buildSnippet(body, snippetTerms(['zebra'], []))).length).toBeGreaterThan(0);
    expect(performance.now() - start).toBeLessThan(1000);
  });
});
