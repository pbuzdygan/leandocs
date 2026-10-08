import { foldLetters } from './fold.js';

/**
 * A parsed search query (PROJECT_SPEC §30, §33): free words, "quoted phrases" and the filters
 * `tag:`, `path:` and `title:`. Any other `key:value` is searched as ordinary text, so technical
 * input such as `host:8080` still works.
 */
export interface ParsedQuery {
  /** Free words; matched as prefixes (type-ahead). */
  words: string[];
  /** Quoted phrases; matched exactly as a phrase. */
  phrases: string[];
  tags: string[];
  paths: string[];
  titles: string[];
}

const TOKEN = /(\w+):"([^"]*)"?|"([^"]*)"?|(\S+)/gu;
const FILTERS = new Set(['tag', 'path', 'title']);

export function parseQuery(input: string): ParsedQuery {
  const query: ParsedQuery = { words: [], phrases: [], tags: [], paths: [], titles: [] };
  for (const token of input.slice(0, 500).matchAll(TOKEN)) {
    const [, quotedKey, quotedValue, phrase, bare] = token;
    if (quotedKey !== undefined && FILTERS.has(quotedKey.toLowerCase())) {
      addFilter(query, quotedKey.toLowerCase(), quotedValue ?? '');
    } else if (quotedKey !== undefined) {
      if (quotedValue?.trim()) query.phrases.push(`${quotedKey}:${quotedValue}`.trim());
    } else if (phrase !== undefined) {
      if (phrase.trim()) query.phrases.push(phrase.trim());
    } else if (bare) {
      const colon = bare.indexOf(':');
      const key = colon > 0 ? bare.slice(0, colon).toLowerCase() : '';
      if (FILTERS.has(key)) addFilter(query, key, bare.slice(colon + 1));
      else query.words.push(bare);
    }
  }
  return query;
}

function addFilter(query: ParsedQuery, key: string, rawValue: string): void {
  const value = rawValue.trim();
  if (!value) return;
  if (key === 'tag') query.tags.push(value.replace(/^#/, ''));
  else if (key === 'path') query.paths.push(value.replace(/^\/+|\/+$/g, ''));
  else query.titles.push(value);
}

/** True when the text contains something the tokenizer will index (a letter or digit). */
function hasToken(text: string): boolean {
  return /[\p{L}\p{N}]/u.test(text);
}

/** A double-quoted FTS5 string: the only way user text reaches MATCH, so syntax cannot leak. */
function quote(text: string): string {
  return `"${foldLetters(text).replace(/"/g, '""')}"`;
}

/**
 * The FTS5 MATCH expression for the text part of the query, or `undefined` when the query has no
 * searchable text (filters only). Terms are combined with AND; words match as prefixes.
 * `title:` values are searched like words and additionally checked against the title in ranking.
 */
export function toFtsExpression(query: ParsedQuery): string | undefined {
  const parts = [
    ...[...query.words, ...query.titles].filter(hasToken).map((word) => `${quote(word)}*`),
    ...query.phrases.filter(hasToken).map(quote),
  ];
  return parts.length > 0 ? parts.join(' AND ') : undefined;
}
