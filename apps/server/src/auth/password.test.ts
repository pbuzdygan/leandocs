import { describe, expect, it } from 'vitest';
import {
  hashPassword,
  MAX_PASSWORD_BYTES,
  needsPasswordRehash,
  verifyPassword,
} from './password.js';

describe('password hashing', () => {
  it('verifies a fixed vector derived independently with Node scrypt', async () => {
    const hash =
      '$scrypt$v=1$N=131072,r=8,p=1$000102030405060708090a0b0c0d0e0f$' +
      '16a213093c4721c3ed047584af4781453cfd2e67c570020b6af758d84278393e';
    expect(await verifyPassword('known password', hash)).toBe(true);
    expect(needsPasswordRehash(hash)).toBe(true);
  });
  it('verifies a fixed Argon2id vector and writes the current PHC format', async () => {
    const hash =
      '$argon2id$v=19$m=65536,t=3,p=1$AAECAwQFBgcICQoLDA0ODw$56sP5rHdTVbD+d0W7O7KIN60/v18vTRZUmfxE6NNDms';
    expect(await verifyPassword('known password', hash)).toBe(true);
    expect(await hashPassword('known password')).toMatch(/^\$argon2id\$v=19\$m=65536,t=3,p=1\$/);
    expect(needsPasswordRehash(hash)).toBe(false);
  });

  it('uses independent salts and verifies only the correct password', async () => {
    const password = 'a sufficiently long password';
    const first = await hashPassword(password);
    const second = await hashPassword(password);
    expect(first).not.toBe(second);
    expect(first).not.toContain(password);
    expect(await verifyPassword(password, first)).toBe(true);
    expect(await verifyPassword(password, second)).toBe(true);
    expect(await verifyPassword('wrong password', first)).toBe(false);
  });

  it('preserves Unicode, spaces and bytes beyond the first 72', async () => {
    const password = `  żółć🔐${'a'.repeat(72)}ending  `;
    const hash = await hashPassword(password);
    expect(await verifyPassword(password, hash)).toBe(true);
    expect(await verifyPassword(password.trim(), hash)).toBe(false);
    expect(await verifyPassword(password.replace('ending', 'changed'), hash)).toBe(false);
    expect(await verifyPassword(password.normalize('NFD'), hash)).toBe(false);
  });

  it('rejects empty and oversized passwords without truncation', async () => {
    for (const password of ['', 'a'.repeat(MAX_PASSWORD_BYTES + 1), '🔐'.repeat(257), '\ud800']) {
      await expect(hashPassword(password)).rejects.toThrow(RangeError);
      expect(await verifyPassword(password, 'invalid')).toBe(false);
    }
    const maximum = 'a'.repeat(MAX_PASSWORD_BYTES);
    const hash = await hashPassword(maximum);
    expect(await verifyPassword(maximum, hash)).toBe(true);
    expect(await verifyPassword(`${maximum}b`, hash)).toBe(false);
  });

  it('fails closed on malformed, tampered and unsupported hashes', async () => {
    const password = 'administrator password';
    const hash = await hashPassword(password);
    for (const invalid of [
      '',
      'plaintext',
      hash.replace('argon2id', 'argon2i'),
      hash.replace('v=19', 'v=20'),
      hash.replace('m=65536', 'm=1073741824'),
      hash.replace('t=3', 't=1'),
      hash.replace('p=1', 'p=0'),
      hash.slice(0, -1),
      `${hash}\n`,
      `${hash}$extra`,
      hash.replace(/.$/, '!'),
    ]) {
      expect(await verifyPassword(password, invalid)).toBe(false);
    }
    const tampered = hash.slice(0, -1) + (hash.endsWith('0') ? '1' : '0');
    expect(await verifyPassword(password, tampered)).toBe(false);
  });
});
