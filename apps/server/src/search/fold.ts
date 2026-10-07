/**
 * Letters that SQLite's unicode61 tokenizer keeps as distinct letters even with
 * `remove_diacritics 2`, because Unicode does not decompose them into a base letter and a mark.
 */
const UNFOLDED: Record<string, string> = {
  ł: 'l',
  Ł: 'L',
  đ: 'd',
  Đ: 'D',
  ø: 'o',
  Ø: 'O',
  ħ: 'h',
  Ħ: 'H',
};
const UNFOLDED_PATTERN = /[łŁđĐøØħĦ]/g;
const HAS_UNFOLDED = /[łŁđĐøØħĦ]/;
const WORD_SEPARATORS = /[^\p{L}\p{N}_]+/u;

/** Replaces letters the tokenizer cannot fold; every other character (and the length) is kept. */
export function foldLetters(text: string): string {
  return text.replace(UNFOLDED_PATTERN, (letter) => UNFOLDED[letter] ?? letter);
}

/** The folded spelling of each distinct word that contains an unfoldable letter. */
export function foldedVariants(...texts: string[]): string {
  const words = new Set<string>();
  // Split into words first: matching words around the letter backtracked quadratically on long
  // words such as hex dumps in code blocks (P15-02).
  for (const text of texts)
    for (const word of text.split(WORD_SEPARATORS))
      if (HAS_UNFOLDED.test(word)) words.add(foldLetters(word).toLowerCase());
  return [...words].join(' ');
}

/** Case-, accent- and letter-folded form used to compare titles, aliases and tags in ranking. */
export function normalizeForMatch(text: string): string {
  return foldLetters(text)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}
