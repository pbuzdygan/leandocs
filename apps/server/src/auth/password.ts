import { argon2, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

// ADR-0009: fixed, versioned parameters prevent stored hashes from selecting excessive costs.
const OPTIONS = { N: 131072, r: 8, p: 1, maxmem: 160 * 1024 * 1024 };
const SALT_BYTES = 16;
const KEY_BYTES = 32;
const PREFIX = '$scrypt$v=1$N=131072,r=8,p=1$';
const HASH_PATTERN = /^\$scrypt\$v=1\$N=131072,r=8,p=1\$([0-9a-f]{32})\$([0-9a-f]{64})$/;
const ARGON_PREFIX = '$argon2id$v=19$m=65536,t=3,p=1$';
const ARGON_PATTERN =
  /^\$argon2id\$v=19\$m=65536,t=3,p=1\$([A-Za-z0-9+/]{22})\$([A-Za-z0-9+/]{43})$/;
export const MAX_PASSWORD_BYTES = 1024;

function validPassword(password: string): boolean {
  if (/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(password))
    return false;
  const bytes = Buffer.byteLength(password, 'utf8');
  return bytes > 0 && bytes <= MAX_PASSWORD_BYTES;
}

function deriveLegacy(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_BYTES, OPTIONS, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    argon2(
      'argon2id',
      {
        message: password,
        nonce: salt,
        memory: 65536,
        passes: 3,
        parallelism: 1,
        tagLength: KEY_BYTES,
      },
      (error, key) => {
        if (error) reject(error);
        else resolve(key);
      },
    );
  });
}

const base64 = (value: Buffer) => value.toString('base64').replace(/=+$/, '');

/** Successful legacy logins upgrade the stored hash; parameters are fixed and bounded. */
export function needsPasswordRehash(encoded: string): boolean {
  return encoded.startsWith(PREFIX);
}

/** Hash exact UTF-8 input without trimming, normalization or truncation. Never log passwords. */
export async function hashPassword(password: string): Promise<string> {
  if (!validPassword(password))
    throw new RangeError(`Password must contain between 1 and ${MAX_PASSWORD_BYTES} UTF-8 bytes`);
  const salt = randomBytes(SALT_BYTES);
  const key = await derive(password, salt);
  return `${ARGON_PREFIX}${base64(salt)}$${base64(key)}`;
}

/** Malformed/unsupported hashes fail closed; crypto failures propagate to the caller. */
export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  if (!validPassword(password)) return false;
  const argon = ARGON_PATTERN.exec(encoded);
  if (argon && argon[0] === encoded) {
    const salt = Buffer.from(argon[1]!, 'base64');
    const expected = Buffer.from(argon[2]!, 'base64');
    if (base64(salt) !== argon[1] || base64(expected) !== argon[2]) return false;
    return timingSafeEqual(await derive(password, salt), expected);
  }
  const match = HASH_PATTERN.exec(encoded);
  // JavaScript's $ also matches before a final newline; require the complete string.
  if (!match || match[0] !== encoded) return false;
  const salt = Buffer.from(match[1]!, 'hex');
  const expected = Buffer.from(match[2]!, 'hex');
  const actual = await deriveLegacy(password, salt);
  return timingSafeEqual(actual, expected);
}
