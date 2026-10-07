#!/usr/bin/env node
// Upgrade check (P15-04, PROJECT_SPEC §102 "Upgrade from the previous version works").
//
// Runs a real installation of the previous release image, uses it like an owner would (account,
// authenticator app, documents written by hand and through the app, attachment, pin, trash),
// stops it, starts the new image on the same data folder and checks that nothing was lost or
// rewritten. Finally it starts the old image again on the upgraded data: when the database schema
// changed it must refuse to start and leave the data untouched; when it did not, it must work.
// The new image must still start afterwards.
//
// Usage: node scripts/upgrade-check.mjs --from <old image> --to <new image> [--keep]
// Needs Docker. Exits 1 with an ::error:: line on the first failed check.
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash, createHmac } from 'node:crypto';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const USERNAME = 'upgrade-admin';
const PASSWORD = 'upgrade check passphrase';
const WINDOWS_1250 = Buffer.from('---\nid: legacy-encoding\n---\n# Zr\xf3d\xb3o\n', 'latin1');

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

class CheckError extends Error {}

function check(condition, message) {
  if (!condition) throw new CheckError(message);
}

function same(actual, expected, message) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  check(a === b, `${message}\n  expected: ${b}\n  actual:   ${a}`);
}

function log(message) {
  process.stdout.write(`• ${message}\n`);
}

function docker(args, options = {}) {
  return execFileSync('docker', args, { encoding: 'utf8', ...options }).trim();
}

async function freePort() {
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
function runArgs(dataDir, port) {
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

class Instance {
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
class Client {
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
class Authenticator {
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

async function signIn(base, authenticator) {
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
function hashTree(dir) {
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
function schemaVersion(dataDir) {
  const header = readFileSync(path.join(dataDir, 'system', 'app.db')).subarray(0, 100);
  check(header.toString('latin1', 0, 15) === 'SQLite format 3', 'system/app.db is not SQLite');
  return header.readUInt32BE(60);
}

function flatten(tree) {
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

function idByPath(items, relative) {
  const item = items.find((entry) => entry.path === relative);
  check(item, `${relative} is missing from the library`);
  return item.id;
}

/** Content the owner might already have: hand-written, without ids, imperfect. */
function seed(content) {
  const put = (relative, data) => {
    mkdirSync(path.dirname(path.join(content, relative)), { recursive: true });
    writeFileSync(path.join(content, relative), data);
  };
  put('Infrastructure/Servers/BUZHULK.md', '# BUZHULK\n\nMain server. See [[Runbook]].\n');
  put(
    'Infrastructure/Runbook.md',
    '---\nid: runbook\ntitle: Runbook\ntags: [ops]\n# keep this comment\ncustom: kept\n---\n\n# Runbook\n\nRestart the zebracorn service.\n',
  );
  put('Infrastructure/Runbook.assets/diagram.txt', 'attachment bytes\n');
  put('Notes/Broken header.md', '---\ntitle: [unclosed\n---\nBody\n');
  put('Notes/Legacy.md', WINDOWS_1250);
  put('Notes/Trash me.md', '---\nid: trash-me\n---\n# Trash me\n');
  put('Źródła/Polski tytuł.md', '---\nid: polish\n---\n# Źródło\n');
}

async function run({ from, to, keep }) {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'leandocs-upgrade-'));
  const content = path.join(dataDir, 'content');
  const system = path.join(dataDir, 'system');
  chmodSync(dataDir, 0o700);
  mkdirSync(content);
  seed(content);
  const running = [];
  try {
    // 1. The previous release, used like an owner would.
    const old = await new Instance(from, dataDir).start();
    running.push(old);
    log(`Old release ${from} reports ${old.version}`);
    const setup = new Client(old.base);
    const status = await setup.ok('GET', '/auth/setup');
    check(status.required, 'A fresh data folder must ask for account setup');
    await setup.ok(
      'POST',
      '/auth/setup',
      { username: USERNAME, password: PASSWORD, confirmPassword: PASSWORD },
      { 'x-leandocs-setup-token': status.setupToken },
    );
    let client = await signIn(old.base);
    const enrollment = await client.ok('POST', '/auth/mfa/enroll', { password: PASSWORD });
    const authenticator = new Authenticator(enrollment.secret);
    const enabled = await client.ok('POST', '/auth/mfa/confirm', {
      code: await authenticator.code(),
    });
    client.csrf = enabled.session.csrfToken;
    check(enabled.recoveryCodes.length > 0, 'Enabling MFA returned no recovery codes');
    client = await signIn(old.base, authenticator);
    log('Account created, authenticator app enabled, signed in with password and code');

    let items = flatten(await client.ok('GET', '/tree'));
    const buzhulk = idByPath(items, 'Infrastructure/Servers/BUZHULK.md');
    check(!buzhulk.startsWith('p-'), 'The old release did not add an id to a file without one');
    const created = await client.ok('POST', '/documents', {
      name: 'Created before upgrade',
      folder: 'Notes',
      content: 'Links to [[Runbook]].\n',
    });
    const runbook = await client.ok('GET', '/documents/runbook');
    await client.ok('PUT', '/documents/runbook', {
      content: `${runbook.content}\nSaved by the old release.\n`,
      expectedRevision: runbook.revision,
    });
    await client.ok('PUT', '/pins/runbook');
    await client.ok('PUT', `/pins/${buzhulk}`);
    await client.ok('DELETE', '/documents/trash-me');
    const sessionCookies = new Map(client.cookies);

    items = flatten(await client.ok('GET', '/tree'));
    const before = {
      tree: items,
      pins: (await client.ok('GET', '/pins')).items.map((pin) => pin.id),
      trash: (await client.ok('GET', '/trash')).items.map((item) => [item.trashId, item.name]),
      attachments: (await client.ok('GET', '/documents/runbook/attachments')).items.map(
        (item) => item.name,
      ),
      backlinks: (await client.ok('GET', '/documents/runbook/backlinks')).items
        .map((link) => link.id)
        .sort(),
    };
    old.stop();
    running.length = 0;
    const oldSchema = schemaVersion(dataDir);
    const files = hashTree(content);
    log(`Old release used: ${items.length} tree entries, ${before.pins.length} pins, 1 trashed`);

    // 2. The new release on the same data folder.
    const next = await new Instance(to, dataDir).start();
    running.push(next);
    log(`New release ${to} reports ${next.version}`);
    same(hashTree(content), files, 'Starting the new release changed files in the content folder');

    const resumed = new Client(next.base, sessionCookies);
    check(
      (await resumed.refreshCsrf()).user?.username === USERNAME,
      'The session from the old release is no longer signed in',
    );
    client = await signIn(next.base, authenticator);
    log('Old session still valid; sign-in with password and authenticator code works');

    same(flatten(await client.ok('GET', '/tree')), before.tree, 'The library changed');
    same(
      (await client.ok('GET', '/pins')).items.map((pin) => pin.id),
      before.pins,
      'Pinned documents changed',
    );
    same(
      (await client.ok('GET', '/trash')).items.map((item) => [item.trashId, item.name]),
      before.trash,
      'The trash changed',
    );
    same(
      (await client.ok('GET', '/documents/runbook/attachments')).items.map((item) => item.name),
      before.attachments,
      'Attachments changed',
    );
    same(
      (await client.ok('GET', '/documents/runbook/backlinks')).items.map((link) => link.id).sort(),
      before.backlinks,
      'Backlinks changed',
    );
    const search = await client.ok('GET', '/search?q=zebracorn');
    same(
      search.results.map((result) => result.id),
      ['runbook'],
      'Search does not find text written before the upgrade',
    );
    const polish = await client.ok('GET', '/search?q=zrodlo');
    check(
      polish.results.some((result) => result.id === 'polish'),
      'Accent-insensitive search does not find "Źródło"',
    );
    const issues = (await client.ok('GET', '/index/status')).issues.map((issue) => [
      issue.code,
      issue.path,
    ]);
    check(
      issues.some(
        ([code, at]) => code === 'FRONTMATTER_INVALID' && at === 'Notes/Broken header.md',
      ),
      `The invalid header is no longer reported: ${JSON.stringify(issues)}`,
    );
    check(
      issues.some(([code, at]) => code === 'NOT_UTF8' && at === 'Notes/Legacy.md'),
      `The file that is not UTF-8 is not reported: ${JSON.stringify(issues)}`,
    );
    log('Library, pins, trash, attachments, backlinks, search and index issues match');

    // The new release keeps working on the upgraded data.
    const document = await client.ok('GET', `/documents/${created.id}`);
    await client.ok('PUT', `/documents/${created.id}`, {
      content: `${document.content}Saved by the new release.\n`,
      expectedRevision: document.revision,
    });
    await client.ok('POST', `/trash/${before.trash[0][0]}/restore`);
    check(
      flatten(await client.ok('GET', '/tree')).some((item) => item.id === 'trash-me'),
      'A document trashed before the upgrade could not be restored',
    );
    log('Saving and restoring from the trash work after the upgrade');
    next.stop();
    running.length = 0;

    // 3. Going back to the old image: refused without changes when the schema is newer, and
    //    simply working when the release did not change the schema.
    const newSchema = schemaVersion(dataDir);
    check(newSchema >= oldSchema, `The schema went back from ${oldSchema} to ${newSchema}`);
    log(`Database schema ${oldSchema} → ${newSchema}`);
    if (newSchema > oldSchema) {
      const upgradedSystem = hashTree(system);
      const upgradedContent = hashTree(content);
      const port = await freePort();
      const name = `leandocs-downgrade-${process.pid}`;
      const downgrade = spawnSync(
        'docker',
        ['run', '--name', name, ...runArgs(dataDir, port), from],
        { encoding: 'utf8', timeout: 120_000 },
      );
      spawnSync('docker', ['rm', '-f', name]);
      check(
        downgrade.status !== 0 && downgrade.status !== null,
        `The old release started on upgraded data (exit ${downgrade.status}); it must refuse`,
      );
      check(
        /newer|schema/i.test(`${downgrade.stdout}${downgrade.stderr}`),
        `The old release did not explain why it refused:\n${downgrade.stdout}${downgrade.stderr}`,
      );
      same(hashTree(system), upgradedSystem, 'The refused downgrade changed the database');
      same(hashTree(content), upgradedContent, 'The refused downgrade changed the content folder');
      log('The old release refuses the newer database without touching any file');
    } else {
      const back = await new Instance(from, dataDir).start();
      running.push(back);
      await signIn(back.base, authenticator);
      back.stop();
      running.length = 0;
      log('Same schema: the old release still starts and signs in on the data');
    }
    const again = await new Instance(to, dataDir).start();
    running.push(again);
    await signIn(again.base, authenticator);
    again.stop();
    running.length = 0;
    log('The new release still starts and signs in afterwards');
    log(`Upgrade ${from} → ${to}: all checks passed`);
  } finally {
    for (const instance of running) {
      process.stdout.write(instance.logs());
      instance.remove();
    }
    if (keep) log(`Data kept in ${dataDir}`);
    else rmSync(dataDir, { recursive: true, force: true });
  }
}

function parseArgs(argv) {
  const options = { keep: false };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--keep') options.keep = true;
    else if (arg === '--from' || arg === '--to') options[arg.slice(2)] = argv[++index];
    else throw new Error(`Unknown argument ${arg}`);
  }
  if (!options.from || !options.to)
    throw new Error('Usage: upgrade-check.mjs --from <old image> --to <new image> [--keep]');
  return options;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    await run(parseArgs(process.argv.slice(2)));
  } catch (error) {
    console.error(`::error::${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
