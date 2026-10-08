import { describe, expect, it } from 'vitest';
import {
  InvalidNameError,
  documentStem,
  isDocumentFileName,
  sanitizeName,
  toDocumentFileName,
} from './file-name.js';

describe('sanitizeName', () => {
  it.each([
    ['Home Assistant', 'Home Assistant'],
    ['  BUZHULK  ', 'BUZHULK'],
    ['Nginx: Proxy/Manager', 'Nginx- Proxy-Manager'],
    ['a\\b*c?d"e<f>g|h', 'a-b-c-d-e-f-g-h'],
    ['multiple   spaces\tand\ttabs', 'multiple spaces and tabs'],
    ['...hidden', 'hidden'],
    ['trailing dots...', 'trailing dots'],
    ['bell\u0007char', 'bellchar'],
    ['Zażółć gęślą jaźń', 'Zażółć gęślą jaźń'],
  ])('%j → %j', (input, expected) => {
    expect(sanitizeName(input)).toBe(expected);
  });

  it.each(['', '   ', '...', 'CON', 'nul', 'com1', 'LPT9', 'Server.assets'])(
    'rejects %j',
    (input) => {
      expect(() => sanitizeName(input)).toThrow(InvalidNameError);
    },
  );

  it('limits the length to 200 bytes without splitting characters', () => {
    const name = sanitizeName('ż'.repeat(300));
    expect(Buffer.byteLength(name, 'utf8')).toBeLessThanOrEqual(200);
    expect(name).toMatch(/^ż+$/);
  });
});

describe('document file names', () => {
  it('appends .md once', () => {
    expect(toDocumentFileName('BUZHULK')).toBe('BUZHULK.md');
    expect(toDocumentFileName('BUZHULK.md')).toBe('BUZHULK.md');
    expect(toDocumentFileName('Notes.MD')).toBe('Notes.md');
  });

  it('recognises documents and stems', () => {
    expect(isDocumentFileName('a.md')).toBe(true);
    expect(isDocumentFileName('A.MD')).toBe(true);
    expect(isDocumentFileName('.md')).toBe(false);
    expect(isDocumentFileName('a.txt')).toBe(false);
    expect(documentStem('Home Assistant.md')).toBe('Home Assistant');
  });
});
