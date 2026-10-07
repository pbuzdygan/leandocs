/**
 * Removes trailing `characters` from `text`. Linear time, unlike `/[…]+$/`, which a regular
 * expression engine retries from every position of a long run (quadratic, P15-02).
 */
export function trimTrailing(text: string, characters: string): string {
  let end = text.length;
  while (end > 0 && characters.includes(text[end - 1]!)) end--;
  return text.slice(0, end);
}
