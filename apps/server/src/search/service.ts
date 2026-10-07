import type Database from 'better-sqlite3';
import {
  SEARCH_DEFAULT_LIMIT,
  SEARCH_MAX_LIMIT,
  type SearchMatch,
  type SearchResult,
} from '@leandocs/shared';
import { normalizeForMatch } from './fold.js';
import { parseQuery, toFtsExpression, type ParsedQuery } from './query.js';
import { buildSnippet, SNIPPET_SCAN_CHARS, snippetTerms } from './snippet.js';

// Column order of documents_fts: title, aliases, tags, headings, filename, path, body, folded.
const BM25_WEIGHTS = [10, 6, 5, 4, 3, 2, 1, 1].join(', ');
// Candidates fetched by bm25 before the tiered ranking; generous so tiers can reorder them.
const CANDIDATES = 500;

/** §32 order: exact title → title prefix → (all words in the title) → alias → tag → heading → body. */
const TIERS: SearchMatch[] = [
  'title',
  'title-prefix',
  'title-words',
  'alias',
  'tag',
  'heading',
  'content',
];

interface Row {
  key: number;
  id: string;
  title: string;
  path: string;
  score: number;
  aliases: string | null;
  tags: string | null;
  headings: string | null;
}

export class SearchService {
  constructor(private readonly db: Database.Database) {}

  search(input: string, limit = SEARCH_DEFAULT_LIMIT): SearchResult[] {
    const query = parseQuery(input);
    const max = Math.min(Math.max(1, Math.trunc(limit)), SEARCH_MAX_LIMIT);
    const fts = toFtsExpression(query);
    const filters = this.filters(query);
    if (!fts && filters.sql.length === 0) return [];

    const rows = fts ? this.matchRows(fts, filters) : this.filterRows(filters);
    const text = [...query.words, ...query.phrases, ...query.titles].join(' ');
    const terms = [...query.words, ...query.phrases, ...query.titles].map(normalizeForMatch);
    const titles = query.titles.map(normalizeForMatch);
    const snippetFor = this.snippets([...query.words, ...query.titles], query.phrases);
    return rows
      .filter((row) =>
        titles.every((title) => containsWords(normalizeForMatch(row.title), [title])),
      )
      .map((row, order) => ({ row, order, match: classify(row, normalizeForMatch(text), terms) }))
      .sort((a, b) => TIERS.indexOf(a.match) - TIERS.indexOf(b.match) || a.order - b.order)
      .slice(0, max)
      .map(({ row, match }) => ({
        id: row.id,
        title: row.title,
        path: row.path,
        match,
        snippet: snippetFor(row.key),
        tags: lines(row.tags),
      }));
  }

  private matchRows(fts: string, filters: { sql: string[]; params: string[] }): Row[] {
    return this.db
      .prepare<string[], Row>(
        `SELECT d.key, d.id, d.title, d.path,
           bm25(documents_fts, ${BM25_WEIGHTS}) AS score,
           documents_fts.aliases AS aliases, documents_fts.tags AS tags,
           documents_fts.headings AS headings
         FROM documents_fts JOIN documents d ON d.key = documents_fts.rowid
         WHERE documents_fts MATCH ? ${filters.sql.map((sql) => `AND ${sql}`).join(' ')}
         ORDER BY score, d.title
         LIMIT ${CANDIDATES}`,
      )
      .all(fts, ...filters.params);
  }

  private filterRows(filters: { sql: string[]; params: string[] }): Row[] {
    return this.db
      .prepare<string[], Row>(
        `SELECT d.key, d.id, d.title, d.path, 0 AS score,
           f.aliases AS aliases, f.tags AS tags, f.headings AS headings
         FROM documents d JOIN documents_fts f ON f.rowid = d.key
         WHERE ${filters.sql.join(' AND ')}
         ORDER BY d.title COLLATE NOCASE, d.path
         LIMIT ${CANDIDATES}`,
      )
      .all(...filters.params);
  }

  /** Snippets are built only for the results returned, from a bounded part of the body. */
  private snippets(words: string[], phrases: string[]) {
    const terms = snippetTerms(words, phrases);
    const body = this.db.prepare<[number, number], { body: string | null }>(
      'SELECT substr(body, 1, ?) AS body FROM documents_fts WHERE rowid = ?',
    );
    return (key: number) =>
      terms.length === 0 ? [] : buildSnippet(body.get(SNIPPET_SCAN_CHARS, key)?.body ?? '', terms);
  }

  private filters(query: ParsedQuery): { sql: string[]; params: string[] } {
    const sql: string[] = [];
    const params: string[] = [];
    for (const tag of query.tags) {
      sql.push(
        `d.key IN (SELECT dt.document_key FROM document_tags dt
           JOIN tags t ON t.id = dt.tag_id WHERE t.name = ?)`,
      );
      params.push(tag);
    }
    for (const folder of query.paths) {
      // A path filter matches from the start of any folder segment, case-insensitively (ASCII).
      sql.push(`(d.path LIKE ? ESCAPE '\\' OR d.path LIKE ? ESCAPE '\\')`);
      const escaped = folder.replace(/[\\%_]/g, (character) => `\\${character}`);
      params.push(`${escaped}%`, `%/${escaped}%`);
    }
    return { sql, params };
  }
}

function lines(value: string | null): string[] {
  return value ? value.split('\n').filter(Boolean) : [];
}

/** True when every term matches the start of a word in `text` (both already normalized). */
function containsWords(text: string, terms: string[]): boolean {
  const padded = ` ${text.replace(/[^\p{L}\p{N}]+/gu, ' ')} `;
  return terms.every((term) => {
    const words = term.replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    return words === '' || padded.includes(` ${words}`);
  });
}

function classify(row: Row, text: string, terms: string[]): SearchMatch {
  if (terms.length === 0) return 'content';
  const title = normalizeForMatch(row.title);
  if (title === text) return 'title';
  if (title.startsWith(text)) return 'title-prefix';
  if (containsWords(title, terms)) return 'title-words';
  if (lines(row.aliases).some((alias) => containsWords(normalizeForMatch(alias), terms)))
    return 'alias';
  if (containsWords(normalizeForMatch(lines(row.tags).join(' ')), terms)) return 'tag';
  if (containsWords(normalizeForMatch(lines(row.headings).join(' ')), terms)) return 'heading';
  return 'content';
}
