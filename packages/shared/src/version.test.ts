import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { APP_VERSION } from './index.js';

const readVersion = (path: string): unknown =>
  (JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as { version?: unknown })
    .version;

describe('version', () => {
  it('comes from the root package.json and is a semantic version', () => {
    expect(APP_VERSION).toBe(readVersion('../../../package.json'));
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
  });

  it('keeps every workspace package on the same version', () => {
    for (const path of [
      '../package.json',
      '../../../apps/server/package.json',
      '../../../apps/web/package.json',
    ]) {
      expect(readVersion(path), path).toBe(APP_VERSION);
    }
  });
});
