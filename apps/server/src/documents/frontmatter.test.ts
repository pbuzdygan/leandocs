import { describe, expect, it } from 'vitest';
import {
  composeFile,
  parseFile,
  setFrontmatterFields,
  toIsoTimestamp,
  updateFileFrontmatter,
} from './frontmatter.js';

describe('parseFile', () => {
  it('handles files without front matter', () => {
    const parsed = parseFile('# Title\n\nBody\n');
    expect(parsed).toMatchObject({ hasFrontmatter: false, data: {}, body: '# Title\n\nBody\n' });
    expect(parsed.error).toBeUndefined();
  });

  it('parses a front matter mapping and the body', () => {
    const parsed = parseFile('---\nid: abc\ntitle: BUZHULK\ntags:\n  - server\n---\n\n# BUZHULK\n');
    expect(parsed.data).toEqual({ id: 'abc', title: 'BUZHULK', tags: ['server'] });
    expect(parsed.body).toBe('# BUZHULK\n');
    expect(parsed.blankLineAfter).toBe(true);
    expect(parsed.rawFrontmatter).toBe('id: abc\ntitle: BUZHULK\ntags:\n  - server');
  });

  it('keeps timestamps as strings', () => {
    expect(parseFile('---\ncreated: 2026-10-02T00:00:00Z\n---\n').data.created).toBe(
      '2026-10-02T00:00:00Z',
    );
  });

  it('accepts an empty front matter block', () => {
    expect(parseFile('---\n---\nBody')).toMatchObject({
      hasFrontmatter: true,
      data: {},
      body: 'Body',
    });
  });

  it('reports invalid YAML without throwing', () => {
    const parsed = parseFile('---\ntitle: [unclosed\n---\nBody');
    expect(parsed.hasFrontmatter).toBe(true);
    expect(parsed.error).toBeTruthy();
    expect(parsed.body).toBe('Body');
  });

  it('reports exponential alias expansion as invalid instead of throwing', () => {
    const levels = ['a: &a [x,x,x,x,x,x,x,x,x]'];
    for (const [name, previous] of [
      ['b', 'a'],
      ['c', 'b'],
      ['d', 'c'],
      ['e', 'd'],
    ])
      levels.push(`${name}: &${name} [${Array(9).fill(`*${previous}`).join(',')}]`);
    const parsed = parseFile(`---\n${levels.join('\n')}\n---\nBody`);
    expect(parsed.data).toEqual({});
    expect(parsed.error).toMatch(/alias/i);
    expect(parsed.body).toBe('Body');
  });

  it('reports non-mapping front matter', () => {
    expect(parseFile('---\n- a\n- b\n---\n').error).toMatch(/mapping/);
  });

  it('detects CRLF and BOM', () => {
    const parsed = parseFile('\uFEFF---\r\nid: x\r\n---\r\nBody\r\n');
    expect(parsed).toMatchObject({ eol: '\r\n', bom: true, data: { id: 'x' }, body: 'Body\r\n' });
  });

  it('does not treat a horizontal rule later in the file as front matter', () => {
    expect(parseFile('Intro\n---\nmore\n---\n').hasFrontmatter).toBe(false);
  });
});

describe('setFrontmatterFields', () => {
  it('replaces a key in place and keeps everything else byte-for-byte', () => {
    const raw = '# comment\ntitle:   "Quoted"\nupdated: 2026-01-01T00:00:00Z\ncustom: {a: 1}';
    const next = setFrontmatterFields(raw, { updated: '2026-10-02T10:00:00Z' });
    expect(next).toBe(
      '# comment\ntitle:   "Quoted"\nupdated: 2026-10-02T10:00:00Z\ncustom: {a: 1}',
    );
  });

  it('appends missing keys at the end', () => {
    expect(setFrontmatterFields('title: A', { id: 'x1' })).toBe('title: A\nid: x1');
    expect(setFrontmatterFields('', { id: 'x1', title: 'B' })).toBe('id: x1\ntitle: B');
  });

  it('replaces multi-line values as a whole', () => {
    const raw = 'tags:\n  - a\n  - b\ntitle: T';
    expect(setFrontmatterFields(raw, { tags: ['c'] })).toBe('tags:\n  - c\ntitle: T');
    expect(setFrontmatterFields('tags:\n- a\n- b\ntitle: T', { tags: 'x' })).toBe(
      'tags: x\ntitle: T',
    );
  });

  it('quotes values that need quoting', () => {
    expect(setFrontmatterFields('', { title: 'Note: important' })).toBe('title: "Note: important"');
  });

  it('keeps CRLF line endings', () => {
    expect(setFrontmatterFields('a: 1\r\nb: 2', { c: 3 }, '\r\n')).toBe('a: 1\r\nb: 2\r\nc: 3');
  });
});

describe('updateFileFrontmatter', () => {
  it('adds front matter to a plain Markdown file without touching the body', () => {
    const body = '# Title\n\nSome *body*.\n';
    const updated = updateFileFrontmatter(body, { id: 'abc' });
    expect(updated).toBe(`---\nid: abc\n---\n\n${body}`);
    expect(parseFile(updated)).toMatchObject({ data: { id: 'abc' }, body });
  });

  it('only adds lines to existing front matter', () => {
    const source = '---\ntitle: BUZHULK\nfoo: bar # keep me\n---\n# BUZHULK\n';
    expect(updateFileFrontmatter(source, { id: 'abc' })).toBe(
      '---\ntitle: BUZHULK\nfoo: bar # keep me\nid: abc\n---\n# BUZHULK\n',
    );
  });

  it('refuses to touch invalid front matter', () => {
    expect(() => updateFileFrontmatter('---\na: [\n---\n', { id: 'x' })).toThrow();
  });

  it('preserves BOM and CRLF', () => {
    expect(updateFileFrontmatter('\uFEFF---\r\na: 1\r\n---\r\nB\r\n', { id: 'x' })).toBe(
      '\uFEFF---\r\na: 1\r\nid: x\r\n---\r\nB\r\n',
    );
  });
});

describe('helpers', () => {
  it('composes files', () => {
    const parts = { rawFrontmatter: 'a: 1', body: 'B', eol: '\n', bom: false } as const;
    expect(composeFile({ ...parts, blankLineAfter: false })).toBe('---\na: 1\n---\nB');
    expect(composeFile({ ...parts, blankLineAfter: true })).toBe('---\na: 1\n---\n\nB');
  });

  it.each([
    '---\nid: x\n---\n\n# Title\n',
    '---\nid: x\n---\n# Title\n',
    '\uFEFF---\r\nid: x\r\n---\r\n\r\nBody\r\n',
    '---\n---\n',
  ])('parse → compose round-trips byte-for-byte: %j', (source) => {
    const parsed = parseFile(source);
    expect(composeFile(parsed)).toBe(source);
  });

  it('formats timestamps without milliseconds', () => {
    expect(toIsoTimestamp(new Date('2026-10-02T01:02:03.456Z'))).toBe('2026-10-02T01:02:03Z');
  });
});
