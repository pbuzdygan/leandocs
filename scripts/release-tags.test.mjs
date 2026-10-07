import { describe, expect, it } from 'vitest';
import { resolveRelease } from './release-tags.mjs';

describe('release tags', () => {
  it('publishes main releases as X.Y.Z and latest', () => {
    expect(resolveRelease('1.2.3')).toEqual({
      channel: 'main',
      branch: 'main',
      version: '1.2.3',
      tags: ['1.2.3', 'latest'],
    });
  });

  it('publishes dev releases as devX.Y.Z and dev_latest only', () => {
    expect(resolveRelease('dev1.2.3')).toEqual({
      channel: 'dev',
      branch: 'dev',
      version: 'dev1.2.3',
      tags: ['dev1.2.3', 'dev_latest'],
    });
  });

  it('takes the version from the tag, whatever package.json says (D-53)', () => {
    expect(resolveRelease('0.1.1').version).toBe('0.1.1');
    expect(resolveRelease('dev0.1.1').version).toBe('dev0.1.1');
  });

  it.each(['v1.2.3', 'latest', 'dev_latest', 'dev-1.2.3', '1.2', '1.2.3-rc.1', 'Dev1.2.3'])(
    'rejects the tag %s',
    (tag) => {
      expect(() => resolveRelease(tag)).toThrow(/must be X\.Y\.Z/);
    },
  );
});
