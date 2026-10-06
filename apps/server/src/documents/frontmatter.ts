import { isMap, parseDocument, stringify } from 'yaml';

/**
 * YAML front matter handling (PROJECT_SPEC §8–9).
 *
 * Writes are deliberately textual and minimal (RULE 10): changing or adding a key touches only
 * that key's line; key order, comments, quoting and line endings elsewhere stay byte-for-byte.
 */

export interface ParsedFile {
  /** Front matter as plain JS data; `{}` when absent or invalid. */
  data: Record<string, unknown>;
  /** Markdown body after the front matter block (and after its blank separator line). */
  body: string;
  /** True when one empty line separates the closing fence from the body (kept on write). */
  blankLineAfter: boolean;
  /** True when a `---` front matter block is present (even if invalid). */
  hasFrontmatter: boolean;
  /** Raw YAML between the fences (without the fences). */
  rawFrontmatter: string;
  /** Present when the block exists but is not a valid YAML mapping. */
  error?: string;
  /** Line ending detected in the file (preserved on write). */
  eol: '\n' | '\r\n';
  /** True when the file starts with a UTF-8 BOM (preserved on write). */
  bom: boolean;
}

/** UTF-8 byte order mark; preserved when present. */
export const BOM = '\uFEFF';

const FRONTMATTER = /^---[ \t]*\r?\n(?:([\s\S]*?)\r?\n)?---[ \t]*(?:\r?\n|$)/;

export function parseFile(source: string): ParsedFile {
  const bom = source.startsWith(BOM);
  const text = bom ? source.slice(1) : source;
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const match = FRONTMATTER.exec(text);
  if (!match) {
    return {
      data: {},
      body: text,
      blankLineAfter: false,
      hasFrontmatter: false,
      rawFrontmatter: '',
      eol,
      bom,
    };
  }
  const rawFrontmatter = match[1] ?? '';
  let body = text.slice(match[0].length);
  const blankLineAfter = body.startsWith(eol);
  if (blankLineAfter) body = body.slice(eol.length);
  const base = { body, blankLineAfter, hasFrontmatter: true, rawFrontmatter, eol, bom } as const;
  if (rawFrontmatter.trim() === '') return { ...base, data: {} };

  const doc = parseDocument(rawFrontmatter);
  if (doc.errors.length > 0) {
    return { ...base, data: {}, error: doc.errors[0]?.message ?? 'Invalid YAML' };
  }
  if (!isMap(doc.contents)) {
    return { ...base, data: {}, error: 'Front matter must be a YAML mapping (key: value)' };
  }
  const data = doc.toJS() as Record<string, unknown>;
  return { ...base, data };
}

/** Serialises one `key: value` line exactly as YAML would (quoting when needed). */
function yamlLine(key: string, value: unknown): string {
  return stringify({ [key]: value }, { lineWidth: 0 }).replace(/\n$/, '');
}

/**
 * Sets top-level keys in raw front matter text with a minimal diff. Existing single-line keys are
 * replaced in place; missing keys are appended. Multi-line values are replaced as a whole block.
 * A value of `undefined` removes the key.
 */
export function setFrontmatterFields(
  rawFrontmatter: string,
  fields: Record<string, unknown>,
  eol: '\n' | '\r\n' = '\n',
): string {
  const lines = rawFrontmatter === '' ? [] : rawFrontmatter.split(/\r?\n/);
  for (const [key, value] of Object.entries(fields)) {
    const start = lines.findIndex((line) => keyOfLine(line) === key);
    // `undefined` removes the key (and its continuation lines); absent keys stay absent.
    const replacement = value === undefined ? [] : yamlLine(key, value).split('\n');
    if (start === -1) {
      lines.push(...replacement);
      continue;
    }
    let end = start + 1;
    // Continuation lines of the old value: indented, list items or blank lines inside the block.
    while (
      end < lines.length &&
      /^(\s+\S|\s*-\s|\s*$)/.test(lines[end] ?? '') &&
      keyOfLine(lines[end] ?? '') === undefined
    ) {
      end++;
    }
    // Do not swallow trailing blank lines that belong to the document layout.
    while (end > start + 1 && (lines[end - 1] ?? '').trim() === '') end--;
    lines.splice(start, end - start, ...replacement);
  }
  return lines.join(eol);
}

function keyOfLine(line: string): string | undefined {
  const match = /^([A-Za-z_][\w-]*)\s*:(?:\s|$)/.exec(line);
  return match?.[1];
}

/** Rebuilds a file from (possibly updated) front matter text and a body, preserving BOM/EOL. */
export function composeFile(parts: {
  rawFrontmatter: string;
  body: string;
  eol: '\n' | '\r\n';
  bom: boolean;
  /** Insert an empty line between the closing fence and the body. */
  blankLineAfter: boolean;
}): string {
  const { rawFrontmatter, body, eol, bom } = parts;
  const block =
    rawFrontmatter === '' ? `---${eol}---${eol}` : `---${eol}${rawFrontmatter}${eol}---${eol}`;
  const separator = parts.blankLineAfter ? eol : '';
  return `${bom ? BOM : ''}${block}${separator}${body}`;
}

/** Adds or replaces front matter fields in a complete file with a minimal diff. */
export function updateFileFrontmatter(source: string, fields: Record<string, unknown>): string {
  const parsed = parseFile(source);
  if (parsed.error) throw new Error(`Cannot update invalid front matter: ${parsed.error}`);
  const rawFrontmatter = setFrontmatterFields(parsed.rawFrontmatter, fields, parsed.eol);
  return composeFile({
    rawFrontmatter,
    body: parsed.body,
    eol: parsed.eol,
    bom: parsed.bom,
    blankLineAfter: parsed.hasFrontmatter
      ? parsed.blankLineAfter
      : parsed.body !== '' && !parsed.body.startsWith(parsed.eol),
  });
}

/** ISO 8601 UTC without milliseconds, as used in examples (PROJECT_SPEC §8). */
export function toIsoTimestamp(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}
