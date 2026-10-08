// Shared helpers of the Docker-based checks (upgrade-check.mjs, backup-check.mjs): real
// containers with the hardened Compose options, a browser-like API client with CSRF and cookies,
// an RFC 6238 authenticator, and the sample content an owner might already have.
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash, createHmac } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import path from 'node:path';

export const USERNAME = 'upgrade-admin';
export const PASSWORD = 'upgrade check passphrase';
export const WINDOWS_1250 = Buffer.from(
  '---\nid: legacy-encoding\n---\n# Zr\xf3d\xb3o\n',
  'latin1',
);

/** RFC 6238 code (SHA-1, 6 digits, 30 s) for a base32 secret, for the given time step. */
export function totpCode(secret, step) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const char of secret.replace(/=+$/, '').toUpperCase())
    bits += alphabet.indexOf(char).toString(2).padStart(5, '0');
  const key = Buffer.from(bits.match(/.{8}/g).map((byte) => parseInt(byte, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = createHmac('sha1', key).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const value = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(value).padStart(6, '0');
}

export class CheckError extends Error {}

export function check(condition, message) {
  if (!condition) throw new CheckError(message);
}

export function same(actual, expected, message) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  check(a === b, `${message}\n  expected: ${b}\n  actual:   ${a}`);
}

export function log(message) {
  process.stdout.write(`• ${message}\n`);
}

export function docker(args, options = {}) {
  return execFileSync('docker', args, { encoding: 'utf8', ...options }).trim();
}

export async function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

/** The hardened run options of compose.yaml, so the check sees what users run. */
export function runArgs(dataDir, port) {
  return [
    '--user',
    `${process.getuid()}:${process.getgid()}`,
    '--read-only',
    '--tmpfs',
    '/tmp',
    '--cap-drop',
    'ALL',
    '--security-opt',
    'no-new-privileges',
    '-p',
    `127.0.0.1:${port}:8080`,
    '-v',
    `${dataDir}:/data`,
  ];
}

export class Instance {
  constructor(image, dataDir) {
    this.image = image;
    this.dataDir = dataDir;
  }

  async start() {
    this.port = await freePort();
    this.base = `http://127.0.0.1:${this.port}`;
    this.id = docker(['run', '-d', ...runArgs(this.dataDir, this.port), this.image]);
    for (let attempt = 0; attempt < 60; attempt++) {
      try {
        const response = await fetch(`${this.base}/api/v1/health`);
        if (response.ok) {
          this.version = (await response.json()).version;
          return this;
        }
      } catch {
        // Not listening yet.
      }
      if (docker(['inspect', '-f', '{{.State.Running}}', this.id]) !== 'true') break;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    const logs = this.logs();
    this.remove();
    throw new CheckError(`${this.image} did not become healthy:\n${logs}`);
  }

  logs() {
    return spawnSync('docker', ['logs', this.id], { encoding: 'utf8' }).stdout ?? '';
  }

  /** Graceful stop, as `docker compose down` does before an image update. */
  stop() {
    docker(['stop', '-t', '30', this.id]);
    this.remove();
  }

  remove() {
    spawnSync('docker', ['rm', '-f', this.id]);
  }
}

/** A browser-like API client: keeps cookies and sends the CSRF token on changes. */
export class Client {
  constructor(base, cookies = new Map()) {
    this.base = base;
    this.cookies = new Map(cookies);
    this.csrf = '';
  }

  async call(method, url, body, headers = {}) {
    const all = { ...headers };
    if (this.cookies.size > 0)
      all.cookie = [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; ');
    if (method !== 'GET' && this.csrf) all['x-leandocs-csrf'] = this.csrf;
    if (body !== undefined) all['content-type'] = 'application/json';
    const response = await fetch(`${this.base}/api/v1${url}`, {
      method,
      headers: all,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    for (const cookie of response.headers.getSetCookie()) {
      const [pair] = cookie.split(';');
      const index = pair.indexOf('=');
      const name = pair.slice(0, index);
      const value = pair.slice(index + 1);
      if (value === '' || /max-age=0/i.test(cookie)) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
    const text = await response.text();
    let json;
    try {
      json = text ? JSON.parse(text) : undefined;
    } catch {
      json = undefined;
    }
    return { status: response.status, json, text };
  }

  async ok(method, url, body, headers) {
    const response = await this.call(method, url, body, headers);
    check(
      response.status >= 200 && response.status < 300,
      `${method} ${url} answered ${response.status}: ${response.text}`,
    );
    return response.json;
  }

  async refreshCsrf() {
    const session = await this.ok('GET', '/auth/session');
    this.csrf = session.csrfToken;
    return session;
  }
}

/** Codes are single-use per time step, so every sign-in waits for a step not used before. */
export class Authenticator {
  constructor(secret) {
    this.secret = secret;
    this.lastStep = -1;
  }

  async code() {
    let step = Math.floor(Date.now() / 30_000);
    while (step <= this.lastStep) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      step = Math.floor(Date.now() / 30_000);
    }
    this.lastStep = step;
    return totpCode(this.secret, step);
  }
}

export async function signIn(base, authenticator) {
  const client = new Client(base);
  await client.refreshCsrf();
  const result = await client.ok('POST', '/auth/login', { username: USERNAME, password: PASSWORD });
  if (result.mfaRequired) {
    check(authenticator, 'Sign-in asked for an authenticator code, but MFA was never enabled');
    const session = await client.ok('POST', '/auth/mfa/verify', {
      challenge: result.challenge,
      code: await authenticator.code(),
    });
    client.csrf = session.csrfToken;
  } else {
    check(!authenticator, 'Sign-in did not ask for the authenticator code after MFA was enabled');
    client.csrf = result.csrfToken;
  }
  check(
    (await client.refreshCsrf()).user?.username === USERNAME,
    'Sign-in did not create a session',
  );
  return client;
}

/** Every file under `dir`, with its SHA-256, in a stable order. */
export function hashTree(dir) {
  const result = {};
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) walk(absolute);
      else if (entry.isFile())
        result[path.relative(dir, absolute)] = createHash('sha256')
          .update(readFileSync(absolute))
          .digest('hex');
    }
  };
  walk(dir);
  return Object.fromEntries(Object.entries(result).sort(([a], [b]) => (a < b ? -1 : 1)));
}

/**
 * `PRAGMA user_version` from the SQLite header (big-endian at offset 60), read without opening the
 * database, so nothing is created or changed. Only valid after a graceful stop (WAL checkpointed).
 */
export function schemaVersion(dataDir) {
  const header = readFileSync(path.join(dataDir, 'system', 'app.db')).subarray(0, 100);
  check(header.toString('latin1', 0, 15) === 'SQLite format 3', 'system/app.db is not SQLite');
  return header.readUInt32BE(60);
}

export function flatten(tree) {
  const items = [];
  const visit = (node) => {
    if (node.type === 'document') items.push({ id: node.id, path: node.path, title: node.title });
    else {
      if (node.path) items.push({ folder: node.path });
      node.children.forEach(visit);
    }
  };
  visit(tree.root);
  return items;
}

export function idByPath(items, relative) {
  const item = items.find((entry) => entry.path === relative);
  check(item, `${relative} is missing from the library`);
  return item.id;
}

/** Content the owner might already have: hand-written, without ids, imperfect. */
export function seed(content) {
  const put = (relative, data) => {
    mkdirSync(path.dirname(path.join(content, relative)), { recursive: true });
    writeFileSync(path.join(content, relative), data);
  };
  put('Infrastructure/Servers/BUZHULK.md', '# BUZHULK\n\nMain server. See [[Runbook]].\n');
  put(
    'Infrastructure/Runbook.md',
    '---\nid: runbook\ntitle: Runbook\ntags: [ops]\n# keep this comment\ncustom: kept\n---\n\n# Runbook\n\nRestart the zebracorn service. [Diagram](Runbook.assets/diagram.txt)\n',
  );
  put('Infrastructure/Runbook.assets/diagram.txt', 'attachment bytes\n');
  put('Notes/Broken header.md', '---\ntitle: [unclosed\n---\nBody\n');
  put('Notes/Legacy.md', WINDOWS_1250);
  put('Notes/Trash me.md', '---\nid: trash-me\n---\n# Trash me\n');
  put('Źródła/Polski tytuł.md', '---\nid: polish\n---\n# Źródło\n');
}

/**
 * Creates the administrator on a fresh installation, enables the authenticator app and signs in
 * with password and code, as an owner would on first run.
 */
export async function setUpAccount(base) {
  const setup = new Client(base);
  const status = await setup.ok('GET', '/auth/setup');
  check(status.required, 'A fresh data folder must ask for account setup');
  await setup.ok(
    'POST',
    '/auth/setup',
    { username: USERNAME, password: PASSWORD, confirmPassword: PASSWORD },
    { 'x-leandocs-setup-token': status.setupToken },
  );
  let client = await signIn(base);
  const enrollment = await client.ok('POST', '/auth/mfa/enroll', { password: PASSWORD });
  const authenticator = new Authenticator(enrollment.secret);
  const enabled = await client.ok('POST', '/auth/mfa/confirm', {
    code: await authenticator.code(),
  });
  client.csrf = enabled.session.csrfToken;
  check(enabled.recoveryCodes.length > 0, 'Enabling MFA returned no recovery codes');
  client = await signIn(base, authenticator);
  return { client, authenticator };
}

/** Prints the logs of instances still running after a failure, then removes them. */
export function cleanUp(running) {
  for (const instance of running.splice(0)) {
    process.stdout.write(instance.logs());
    instance.remove();
  }
}
