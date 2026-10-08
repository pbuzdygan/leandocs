import { describe, expect, it } from 'vitest';
import { validateSetup } from './auth.js';

describe('setup validation', () => {
  const valid = {
    username: ' Admin-1 ',
    password: 'a long passphrase 🔐',
    confirmPassword: 'a long passphrase 🔐',
  };
  it('accepts username trimming and exact Unicode passphrases', () => {
    expect(validateSetup(valid)).toBeNull();
    expect(
      validateSetup({ ...valid, password: '🔐'.repeat(15), confirmPassword: '🔐'.repeat(15) }),
    ).toBeNull();
  });
  it('checks username, length, byte limit and exact confirmation', () => {
    expect(validateSetup({ ...valid, username: 'a b' })).toContain('Username');
    expect(validateSetup({ ...valid, username: 'a'.repeat(65) })).toContain('Username');
    expect(validateSetup({ ...valid, password: '🔐'.repeat(14) })).toContain('15');
    expect(validateSetup({ ...valid, password: '🔐'.repeat(257) })).toContain('1024');
    expect(validateSetup({ ...valid, confirmPassword: `${valid.password} ` })).toContain('match');
  });
});
