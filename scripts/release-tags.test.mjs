import { describe, expect, it } from 'vitest';
import { resolveRelease } from './release-tags.mjs';

describe('release tags', () => {
  it('publishes main releases as X.Y.Z and latest', () => {
    expect(resolveRelease('1.2.3', '1.2.3')).toEqual({
      channel: 'main',
      branch: 'main',
      version: '1.2.3',
      tags: ['1.2.3', 'latest'],
    });
  });

  it('publishes dev releases as devX.Y.Z and dev_latest only', () => {
    expect(resolveRelease('dev1.2.3', '1.2.3')).toEqual({
      channel: 'dev',
      branch: 'dev',
      version: 'dev1.2.3',
      tags: ['dev1.2.3', 'dev_latest'],
    });
  });

  it('rejects tags that do not match the package version', () => {
    expect(() => resolveRelease('1.2.4', '1.2.3')).toThrow(/does not match/);
    expect(() => resolveRelease('dev1.2.4', '1.2.3')).toThrow(/does not match/);
  });

  it.each(['v1.2.3', 'latest', 'dev_latest', 'dev-1.2.3', '1.2', '1.2.3-rc.1', 'Dev1.2.3'])(
    'rejects the tag %s',
    (tag) => {
      expect(() => resolveRelease(tag, '1.2.3')).toThrow(/must be X\.Y\.Z/);
    },
  );
});
