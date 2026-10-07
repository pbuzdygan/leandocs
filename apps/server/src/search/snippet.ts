import type { SnippetPart } from '@leandocs/shared';
import { normalizeForMatch } from './fold.js';

/**
 * Characters of a document body searched for the snippet. FTS5's own `snippet()` and
 * `highlight()` take quadratic time in the number of matches in one document (32,000 matches
 * took ~10 s, P15-02), so snippets are built here, in linear time and from a bounded prefix.
 */
export const SNIPPET_SCAN_CHARS = 200_000;
/** Words in a snippet, as FTS5's `snippet(…, 16)` produced before. */
const WINDOW_TOKENS = 16;
/** Words of context shown before the first match. */
const CONTEXT_BEFORE = 4;
const TOKEN = /[\p{L}\p{N}\p{M}]+/gu;

/** A query word (matched as a prefix, like the FTS query) or a quoted phrase (exact). */
export interface SnippetTerm {
  tokens: string[];
  prefix: boolean;
}

export function snippetTerms(words: readonly string[], phrases: readonly string[]): SnippetTerm[] {
  const tokens = (text: string) => normalizeForMatch(text).match(/[\p{L}\p{N}]+/gu) ?? [];
  return [
    ...words.map((word) => ({ tokens: tokens(word), prefix: true })),
    ...phrases.map((phrase) => ({ tokens: tokens(phrase), prefix: false })),
  ].filter((term) => term.tokens.length > 0);
}

/**
 * Up to 16 words around the first match in `body`, with every matched word or phrase marked.
 * Without a match in the scanned text, the beginning of the body.
 */
export function buildSnippet(body: string, terms: readonly SnippetTerm[]): SnippetPart[] {
  if (terms.length === 0) return [];
  const text = body.slice(0, SNIPPET_SCAN_CHARS);
  const tokens = [...text.matchAll(TOKEN)].map((match) => ({
    start: match.index,
    end: match.index + match[0].length,
    word: normalizeForMatch(match[0]),
  }));
  if (tokens.length === 0) return [];

  const matchAt = (index: number): number => {
    for (const term of terms) {
      const ok = term.tokens.every((wanted, offset) => {
        const word = tokens[index + offset]?.word;
        if (word === undefined) return false;
        const last = offset === term.tokens.length - 1;
        return last && term.prefix ? word.startsWith(wanted) : word === wanted;
      });
      if (ok) return term.tokens.length;
    }
    return 0;
  };

  let first = tokens.findIndex((_, index) => matchAt(index) > 0);
  if (first === -1) first = 0;
  const start = Math.max(0, first - CONTEXT_BEFORE);
  const end = Math.min(tokens.length, start + WINDOW_TOKENS);

  const parts: SnippetPart[] = [];
  const add = (value: string, match: boolean) => {
    if (!value) return;
    const last = parts.at(-1);
    if (last && last.match === match) last.text += value;
    else parts.push({ text: value, match });
  };
  if (start > 0) add('…', false);
  let position = tokens[start]!.start;
  for (let index = start; index < end;) {
    const length = Math.min(matchAt(index), end - index);
    if (length === 0) {
      index++;
      continue;
    }
    add(text.slice(position, tokens[index]!.start), false);
    position = tokens[index + length - 1]!.end;
    add(text.slice(tokens[index]!.start, position), true);
    index += length;
  }
  add(text.slice(position, tokens[end - 1]!.end), false);
  if (end < tokens.length || body.length > text.length) add('…', false);
  return parts;
}
