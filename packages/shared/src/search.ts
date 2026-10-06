/** Where a search result matched, best first (PROJECT_SPEC §32). */
export type SearchMatch =
  | 'title'
  | 'title-prefix'
  /** Every searched word starts a word of the title. */
  | 'title-words'
  | 'alias'
  | 'tag'
  | 'heading'
  | 'content';

/** A piece of a snippet; `match` marks the matched words. Plain text, never HTML. */
export interface SnippetPart {
  text: string;
  match: boolean;
}

export interface SearchResult {
  id: string;
  title: string;
  path: string;
  match: SearchMatch;
  /** Context around the match in the body; empty when the body has no text. */
  snippet: SnippetPart[];
  tags: string[];
}

export interface SearchResponse {
  query: string;
  results: SearchResult[];
}

export const SEARCH_DEFAULT_LIMIT = 20;
export const SEARCH_MAX_LIMIT = 50;
