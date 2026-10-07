import { describe, expect, it } from 'vitest';
import { totpCode } from './upgrade-check.mjs';

describe('upgrade check authenticator codes', () => {
  // RFC 6238 appendix B (SHA-1 secret "12345678901234567890"), last six digits.
  const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

  it.each([
    [59, '287082'],
    [1111111109, '081804'],
    [1234567890, '005924'],
    [20000000000, '353130'],
  ])('at %i s is %s', (seconds, code) => {
    expect(totpCode(secret, Math.floor(seconds / 30))).toBe(code);
  });
});
