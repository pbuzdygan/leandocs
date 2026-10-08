import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  HUB,
  documentId,
  documentSource,
  documentTitle,
  folderOf,
  generateLibrary,
} from './performance-check.mjs';

const dirs = [];
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

describe('performance library', () => {
  it('generates the same documents on every run', () => {
    expect(documentSource(42, 10_000)).toBe(documentSource(42, 10_000));
    expect(documentSource(42, 10_000)).not.toBe(documentSource(43, 10_000));
  });

  it('spreads documents over 100 folders with ids, unique markers and hub links', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'leandocs-performance-test-'));
    dirs.push(dir);
    generateLibrary(dir, 1_000);
    const areas = readdirSync(dir);
    expect(areas).toHaveLength(10);
    const folders = areas.flatMap((area) => readdirSync(path.join(dir, area)));
    expect(folders).toHaveLength(100);
    const files = folders.length * readdirSync(path.join(dir, folderOf(0, 1_000))).length;
    expect(files).toBe(1_000);

    const source = (index) =>
      readFileSync(path.join(dir, folderOf(index, 1_000), `${documentTitle(index)}.md`), 'utf8');
    expect(source(7)).toContain(`id: ${documentId(7)}`);
    expect(source(7)).toContain('marker7x');
    expect(source(7)).toContain(`[[${documentTitle(HUB)}]]`);
    // Hand-written files without an id.
    expect(source(100)).not.toContain('id: ');
    const linking = Array.from({ length: 1_000 }, (_, index) => source(index)).filter((text) =>
      text.includes(`Back to [[${documentTitle(HUB)}]]`),
    );
    expect(linking).toHaveLength(50);
  });
});
