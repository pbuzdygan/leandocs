import { describe, expect, it } from 'vitest';
import { deriveTitle } from './documents/registry.js';
import { normalizeRelativePath } from './filesystem/safe-path.js';
import { sanitizeName } from './filesystem/file-name.js';
import { foldedVariants } from './search/fold.js';
import { trimTrailing } from './text.js';

/** Runs `run` and fails when it takes longer than a linear algorithm could (P15-02). */
function expectFast(run: () => unknown, limitMs = 1000): void {
  const start = performance.now();
  run();
  expect(performance.now() - start).toBeLessThan(limitMs);
}

describe('trimTrailing', () => {
  it('removes only trailing characters from the set', () => {
    expect(trimTrailing('a. .', '. ')).toBe('a');
    expect(trimTrailing('...', '.')).toBe('');
    expect(trimTrailing('a.b', '.')).toBe('a.b');
  });
});

// Each input below took tens of seconds to minutes with the former backtracking patterns.
describe('text handling stays linear on long runs', () => {
  it('derives a title from a very long heading line', () => {
    expectFast(() =>
      expect(deriveTitle({}, `# a${' '.repeat(200_000)}b`, 'Doc.md')).toMatch(/^a +b$/),
    );
    expectFast(() => expect(deriveTitle({}, `# a${'#'.repeat(200_000)}`, 'Doc.md')).toBe('a'));
  });

  it('keeps the established title rules', () => {
    expect(deriveTitle({}, '# Title ##\n', 'Doc.md')).toBe('Title');
    expect(deriveTitle({}, 'Intro\n#\tTabbed  \r\n', 'Doc.md')).toBe('Tabbed');
    expect(deriveTitle({}, '#   \n# Second\n', 'Doc.md')).toBe('Second');
    expect(deriveTitle({}, '#NoSpace\n', 'Doc.md')).toBe('Doc');
  });

  it('sanitises and normalises long names and paths', () => {
    expectFast(() => expect(sanitizeName(`${'. '.repeat(100_000)}x`).length).toBeLessThan(201));
    expectFast(() => expect(() => sanitizeName(`x${'. '.repeat(100_000)}`)).not.toThrow());
    expectFast(() => expect(normalizeRelativePath(`a${'/'.repeat(200_000)}`)).toBe('a'));
  });

  it('collects folded search variants from long words', () => {
    expectFast(() => expect(foldedVariants(`${'a'.repeat(200_000)} Łódź`)).toBe('lódź'));
  });
});
