import { describe, expect, it } from 'vitest';
import {
  displayFolder,
  folderSegments,
  formatDate,
  formatRelativeTime,
  parentPath,
  readingMinutes,
  stripExtension,
} from './format';

describe('format', () => {
  const now = new Date('2026-10-02T12:00:00Z');

  it('formats relative times', () => {
    expect(formatRelativeTime('2026-10-02T11:59:40Z', now)).toBe('just now');
    expect(formatRelativeTime('2026-10-02T11:56:00Z', now)).toBe('4 minutes ago');
    expect(formatRelativeTime('2026-10-01T12:00:00Z', now)).toBe('yesterday');
    expect(formatRelativeTime('2026-08-01T12:00:00Z', now)).toBe('1 Aug 2026');
    expect(formatRelativeTime('garbage', now)).toBe('');
  });

  it('formats dates and paths', () => {
    expect(formatDate('2026-10-02T00:00:00Z')).toBe('2 Oct 2026');
    expect(folderSegments('A/B/C.md')).toEqual(['A', 'B']);
    expect(displayFolder('')).toBe('Documentation');
    expect(displayFolder('A/B')).toBe('A / B');
    expect(stripExtension('Home Assistant.md')).toBe('Home Assistant');
    expect(parentPath('A/B/C.md')).toBe('A/B');
    expect(parentPath('C.md')).toBe('');
  });

  it('estimates reading time', () => {
    expect(readingMinutes('')).toBe(1);
    expect(readingMinutes('word '.repeat(1000))).toBe(5);
  });
});
