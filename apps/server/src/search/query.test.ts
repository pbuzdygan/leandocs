import { describe, expect, it } from 'vitest';
import { foldedVariants, foldLetters, normalizeForMatch } from './fold.js';
import { parseQuery, toFtsExpression } from './query.js';

describe('parseQuery', () => {
  it('separates words, phrases and filters (§33)', () => {
    expect(
      parseQuery('docker tag:server path:Infrastructure title:"Main host" "exact words"'),
    ).toEqual({
      words: ['docker'],
      phrases: ['exact words'],
      tags: ['server'],
      paths: ['Infrastructure'],
      titles: ['Main host'],
    });
  });

  it('keeps unknown key:value input as text and normalises filter values', () => {
    expect(parseQuery('host:8080 TAG:#Lab path:/Infra/ tag: "unclosed phrase')).toEqual({
      words: ['host:8080'],
      phrases: ['unclosed phrase'],
      tags: ['Lab'],
      paths: ['Infra'],
      titles: [],
    });
  });
});

describe('toFtsExpression', () => {
  it('quotes every term so user input cannot inject FTS5 syntax', () => {
    expect(toFtsExpression(parseQuery('a"b NEAR(x) OR -y'))).toBe(
      '"a""b"* AND "NEAR(x)"* AND "OR"* AND "-y"*',
    );
  });

  it('drops terms without letters or digits and returns undefined for filter-only queries', () => {
    expect(toFtsExpression(parseQuery('*** --- ()'))).toBeUndefined();
    expect(toFtsExpression(parseQuery('tag:docker'))).toBeUndefined();
  });

  it('folds letters the tokenizer keeps (ł) and matches phrases without a prefix star', () => {
    expect(toFtsExpression(parseQuery('Źródło "biały kruk"'))).toBe('"Źródlo"* AND "bialy kruk"');
  });
});

describe('folding', () => {
  it('keeps length and other characters', () => {
    expect(foldLetters('Łódź, łoś i Ødegaard')).toBe('Lódź, loś i Odegaard');
  });

  it('collects folded variants only for words that need them', () => {
    expect(foldedVariants('Źródło zasilania', 'Biały źródło')).toBe('źródlo bialy');
  });

  it('normalizes for comparisons', () => {
    expect(normalizeForMatch('  Źródło   Zasilania ')).toBe('zrodlo zasilania');
  });
});
