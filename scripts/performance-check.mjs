#!/usr/bin/env node
// Performance check (P15-07, PROJECT_SPEC §84): generates a library of realistic documents, runs
// the built server against it and measures the operations an owner notices: start-up indexing,
// restart, tree, search, opening and saving documents, renames that rewrite links, external
// edits, attachment downloads next to saves, and a large import. Every result is compared with a
// budget; the script exits with 1 when one is exceeded. Run `pnpm build` first.
//
//   pnpm test:performance [--documents 10000] [--keep]
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CheckError, Client, check, freePort, log } from './docker-harness.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVER = path.join(ROOT, 'apps/server/dist/main.js');

/** Budgets in milliseconds (MiB for memory) for 10,000 documents; scaled for other sizes. */
export const BUDGETS = {
  firstStart: 120_000,
  restart: 15_000,
  tree: 500,
  search: 150,
  open: 100,
  save: 300,
  create: 300,
  rename: 3_000,
  externalEdit: 5_000,
  saveDuringDownload: 1_000,
  import: 60_000,
  memory: 1_024,
};

/** Deterministic pseudo-random numbers, so every run measures the same library. */
export function random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SYLLABLES = ['ka', 'lo', 'mi', 'ne', 'ru', 'sa', 'to', 'vi', 'ze', 'pa', 'qui', 'dor'];
const TAGS = Array.from({ length: 40 }, (_, index) => `tag-${index}`);

function word(next) {
  let result = '';
  const length = 2 + Math.floor(next() * 3);
  for (let i = 0; i < length; i++) result += SYLLABLES[Math.floor(next() * SYLLABLES.length)];
  return result;
}

function sentence(next, words) {
  const parts = Array.from({ length: words }, () => word(next));
  parts[0] = parts[0][0].toUpperCase() + parts[0].slice(1);
  return `${parts.join(' ')}.`;
}

/** The document many others link to. */
export const HUB = 3;

export function documentId(index) {
  return `doc-${String(index).padStart(5, '0')}`;
}

export function documentTitle(index) {
  return `Document ${String(index).padStart(5, '0')}`;
}

/** Folder of document `index`: 10 areas × 10 topics, about 100 documents per folder. */
export function folderOf(index, count) {
  const perFolder = Math.max(1, Math.ceil(count / 100));
  const folder = Math.floor(index / perFolder);
  return `Area ${Math.floor(folder / 10)}/Topic ${folder % 10}`;
}

/**
 * About 3 KB of Markdown with front matter, headings, prose, wiki links and relative links to
 * other documents, a table, a task list and a code block. Every 100th document has no id, as
 * hand-written files do. `marker<index>x` is a word that appears only in this document.
 */
export function documentSource(index, count) {
  const next = random(index + 1);
  const pick = () => Math.floor(next() * count);
  const tags = [TAGS[index % TAGS.length], TAGS[(index * 7) % TAGS.length]];
  const lines = ['---'];
  if (index % 100 !== 0) lines.push(`id: ${documentId(index)}`);
  lines.push(
    `title: ${documentTitle(index)}`,
    `tags: [${tags.join(', ')}]`,
    'created: 2026-01-01T00:00:00Z',
    '---',
    '',
    `# ${documentTitle(index)}`,
    '',
    `${sentence(next, 12)} Marker marker${index}x. ${sentence(next, 15)}`,
    '',
  );
  for (let section = 0; section < 4; section++) {
    lines.push(`## ${sentence(next, 3).slice(0, -1)}`, '');
    for (let paragraph = 0; paragraph < 2; paragraph++)
      lines.push(Array.from({ length: 4 }, () => sentence(next, 10)).join(' '), '');
  }
  const linked = pick();
  const relative = path.posix.relative(
    folderOf(index, count),
    `${folderOf(linked, count)}/${documentTitle(linked)}.md`,
  );
  lines.push(
    `See [[${documentTitle(pick())}]], [[${documentTitle(pick())}]] and [the other one](${encodeURI(relative)}).`,
    '',
    '| Name | Value |',
    '| ---- | ----- |',
    `| ${word(next)} | ${Math.floor(next() * 1000)} |`,
    `| ${word(next)} | ${Math.floor(next() * 1000)} |`,
    '',
    `- [ ] ${sentence(next, 5)}`,
    `- [x] ${sentence(next, 5)}`,
    '',
    '```sh',
    `systemctl restart ${word(next)}.service`,
    '```',
    '',
  );
  // Every 20th document links the hub, the worst case for renames.
  if (index % 20 === 7 && index !== HUB) lines.push(`Back to [[${documentTitle(HUB)}]].`, '');
  return lines.join('\n');
}

export function generateLibrary(content, count) {
  for (let index = 0; index < count; index++) {
    const folder = path.join(content, folderOf(index, count));
    if (index === 0 || folderOf(index - 1, count) !== folderOf(index, count))
      mkdirSync(folder, { recursive: true });
    writeFileSync(path.join(folder, `${documentTitle(index)}.md`), documentSource(index, count));
  }
}

/** Median, 95th percentile and maximum of `runs` timed calls. */
async function measure(runs, task) {
  const times = [];
  for (let run = 0; run < runs; run++) {
    const started = performance.now();
    await task(run);
    times.push(performance.now() - started);
  }
  times.sort((a, b) => a - b);
  const at = (share) => times[Math.min(times.length - 1, Math.floor(share * times.length))];
  return { median: at(0.5), p95: at(0.95), max: times[times.length - 1] };
}

/** Resident memory (MiB) of a process and of its descendants, read from /proc (Linux only). */
function treeMemory(pid) {
  const rss = (current) => {
    try {
      const status = readFileSync(`/proc/${current}/status`, 'utf8');
      return Number(/VmRSS:\s+(\d+)/.exec(status)?.[1] ?? 0) / 1024;
    } catch {
      return 0; // The process ended while it was read.
    }
  };
  const children = (current) => {
    try {
      return readdirSync(`/proc/${current}/task`).flatMap((task) =>
        readFileSync(`/proc/${current}/task/${task}/children`, 'utf8')
          .split(' ')
          .filter(Boolean)
          .map(Number),
      );
    } catch {
      return [];
    }
  };
  let descendants = 0;
  const visit = (current) => {
    for (const child of children(current)) {
      descendants += rss(child);
      visit(child);
    }
  };
  visit(pid);
  return { server: rss(pid), descendants };
}

class Server {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.peak = { server: 0, descendants: 0, total: 0 };
  }

  async start() {
    this.port = await freePort();
    this.base = `http://127.0.0.1:${this.port}`;
    this.output = '';
    const started = performance.now();
    this.process = spawn(process.execPath, [SERVER], {
      env: {
        ...process.env,
        DATA_DIR: this.dataDir,
        PORT: String(this.port),
        HOST: '127.0.0.1',
        AUTH_MODE: 'none',
        LOG_LEVEL: 'warn',
        NODE_ENV: 'production',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    this.process.stdout.on('data', (chunk) => (this.output += chunk));
    this.process.stderr.on('data', (chunk) => (this.output += chunk));
    this.sampler = setInterval(() => {
      const now = treeMemory(this.process.pid);
      this.peak.server = Math.max(this.peak.server, now.server);
      this.peak.descendants = Math.max(this.peak.descendants, now.descendants);
      this.peak.total = Math.max(this.peak.total, now.server + now.descendants);
    }, 100);
    while (this.process.exitCode === null) {
      try {
        if ((await fetch(`${this.base}/api/v1/health`)).ok) {
          this.client = new Client(this.base);
          await this.client.refreshCsrf();
          return performance.now() - started;
        }
      } catch {
        // Not listening yet: the server indexes before it listens.
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    clearInterval(this.sampler);
    throw new CheckError(`The server stopped during start-up:\n${this.output}`);
  }

  async stop() {
    clearInterval(this.sampler);
    if (this.process.exitCode !== null) return;
    const exited = new Promise((resolve) => this.process.once('exit', resolve));
    this.process.kill('SIGTERM');
    await exited;
  }
}

async function multipart(server, url, form) {
  const response = await fetch(`${server.base}/api/v1${url}`, {
    method: 'POST',
    headers: { 'x-leandocs-csrf': server.client.csrf },
    body: form,
  });
  const text = await response.text();
  check(response.ok, `POST ${url} answered ${response.status}: ${text}`);
  return JSON.parse(text);
}

async function waitFor(condition, timeout) {
  const started = performance.now();
  while (performance.now() - started < timeout * 4) {
    if (await condition()) return performance.now() - started;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new CheckError(`Gave up after ${timeout * 4} ms`);
}

async function run({ documents, keep }) {
  check(
    readdirSync(path.dirname(SERVER)).includes('main.js'),
    `${SERVER} is missing; run pnpm build first`,
  );
  const scale = documents / 10_000;
  const results = [];
  const record = (name, value, budget, detail = '') => {
    results.push({ name, value, budget, detail });
    log(`${name}: ${value.toFixed(0)}${name.startsWith('Memory') ? ' MiB' : ' ms'} ${detail}`);
  };
  const dataDir = mkdtempSync(path.join(tmpdir(), 'leandocs-performance-'));
  const content = path.join(dataDir, 'content');
  let server;
  try {
    let started = performance.now();
    generateLibrary(content, documents);
    log(`Generated ${documents} documents in ${(performance.now() - started).toFixed(0)} ms`);

    server = new Server(dataDir);
    record(
      'First start (index everything)',
      await server.start(),
      BUDGETS.firstStart * Math.max(scale, 0.1),
    );
    let client = server.client;
    const settled = treeMemory(server.process.pid);
    record(
      'Memory after first start',
      settled.server + settled.descendants,
      BUDGETS.memory,
      `(server ${settled.server.toFixed(0)}, analysis ${settled.descendants.toFixed(0)})`,
    );
    const tree = await measure(10, () => client.ok('GET', '/tree'));
    record('Tree', tree.p95, BUDGETS.tree, `(p95, median ${tree.median.toFixed(0)})`);
    const total = (await client.ok('GET', '/search?q=marker7x&limit=50')).results.length;
    check(total >= 1, 'Search did not find a generated document');

    const queries = ['marker4242x', 'kalo', 'systemctl restart', 'Document 0', 'tag-3', 'zzzz'];
    const search = await measure(60, (run) =>
      client.ok('GET', `/search?q=${encodeURIComponent(queries[run % queries.length])}`),
    );
    record('Search', search.p95, BUDGETS.search, `(p95, median ${search.median.toFixed(0)})`);

    const ids = Array.from({ length: 50 }, (_, run) => documentId((run * 197 + 1) % documents));
    const open = await measure(ids.length, (run) => client.ok('GET', `/documents/${ids[run]}`));
    record('Open document', open.p95, BUDGETS.open, `(p95, median ${open.median.toFixed(0)})`);
    await measure(ids.length, (run) => client.ok('GET', `/documents/${ids[run]}/backlinks`)).then(
      (backlinks) =>
        record(
          'Backlinks',
          backlinks.p95,
          BUDGETS.open,
          `(p95, median ${backlinks.median.toFixed(0)})`,
        ),
    );

    const save = await measure(20, async (run) => {
      const document = await client.ok('GET', `/documents/${ids[run]}`);
      await client.ok('PUT', `/documents/${ids[run]}`, {
        content: `${document.content}\nEdited ${run}.\n`,
        expectedRevision: document.revision,
      });
    });
    record(
      'Open and save',
      save.p95,
      BUDGETS.save + BUDGETS.open,
      `(p95, median ${save.median.toFixed(0)})`,
    );
    const create = await measure(20, (run) =>
      client.ok('POST', '/documents', {
        name: `Created ${run}`,
        folder: folderOf(0, documents),
        content: `Links to [[${documentTitle(run)}]].\n`,
      }),
    );
    record('Create', create.p95, BUDGETS.create, `(p95, median ${create.median.toFixed(0)})`);

    // The renamed document is linked from others, so every linking file is rewritten.
    const target = documentId(HUB);
    const backlinkCount = (await client.ok('GET', `/documents/${target}/backlinks`)).items.length;
    const rename = await measure(3, (run) =>
      client.ok('POST', `/documents/${target}/rename`, { name: `Renamed ${run}` }),
    );
    record(
      'Rename with links',
      rename.max,
      BUDGETS.rename,
      `(max, ${backlinkCount} linking documents)`,
    );

    // An edit in another editor shows up in search without a request touching the document.
    const outside = path.join(content, folderOf(5, documents), `${documentTitle(5)}.md`);
    writeFileSync(outside, `${readFileSync(outside, 'utf8')}\nExternalword.\n`);
    record(
      'External edit searchable',
      await waitFor(
        async () =>
          (await client.ok('GET', '/search?q=externalword')).results.some(
            (result) => result.id === documentId(5),
          ),
        BUDGETS.externalEdit,
      ),
      BUDGETS.externalEdit,
    );

    // KI-8: downloading large attachments must not hold up saves.
    const big = Buffer.alloc(40 * 1024 * 1024, 'a');
    const form = new FormData();
    form.append('file', new Blob([big], { type: 'text/plain' }), 'big.txt');
    const owner = documentId(1);
    await multipart(server, `/documents/${owner}/attachments`, form);
    const downloads = Array.from({ length: 6 }, () =>
      client.call('GET', `/documents/${owner}/attachments/big.txt`),
    );
    const during = await measure(5, async (run) => {
      const document = await client.ok('GET', `/documents/${ids[run]}`);
      await client.ok('PUT', `/documents/${ids[run]}`, {
        content: `${document.content}\nDuring download ${run}.\n`,
        expectedRevision: document.revision,
      });
    });
    for (const download of await Promise.all(downloads))
      check(download.status === 200 && download.text.length === big.length, 'Download failed');
    record('Save while downloading', during.max, BUDGETS.saveDuringDownload, '(max, 6 × 40 MiB)');

    // An import of a tenth of the library into a new folder.
    const imported = Math.max(10, Math.floor(documents / 10));
    const files = new FormData();
    for (let index = 0; index < imported; index++)
      files.append(
        'files',
        new Blob([documentSource(index, documents).replace(/^id: .*\n/m, '')], {
          type: 'text/markdown',
        }),
        `Imported/${folderOf(index, documents)}/${documentTitle(index)}.md`,
      );
    await client.ok('POST', '/folders', { name: 'Import target' });
    started = performance.now();
    const report = await multipart(
      server,
      '/import?importer=markdown-directory&destination=Import%20target',
      files,
    );
    record(
      'Import',
      performance.now() - started,
      BUDGETS.import * Math.max(scale, 0.1),
      `(${imported} documents)`,
    );
    check(report.summary.documents === imported, `Import wrote ${JSON.stringify(report.summary)}`);

    await server.stop();
    const { peak } = server;
    server = new Server(dataDir);
    record('Restart', await server.start(), BUDGETS.restart * Math.max(scale, 0.1));
    client = server.client;
    record(
      'Memory (peak, server and analysis process)',
      Math.max(peak.total, server.peak.total),
      BUDGETS.memory,
      `(server ${peak.server.toFixed(0)}, analysis ${peak.descendants.toFixed(0)})`,
    );
    await server.stop();
  } finally {
    await server?.stop();
    if (keep) log(`Kept ${dataDir}`);
    else rmSync(dataDir, { recursive: true, force: true });
  }
  const failed = results.filter((result) => result.value > result.budget);
  process.stdout.write('\n| Measurement | Result | Budget |\n| --- | ---: | ---: |\n');
  for (const result of results) {
    const unit = result.name.startsWith('Memory') ? 'MiB' : 'ms';
    process.stdout.write(
      `| ${result.name} | ${result.value.toFixed(0)} ${unit} | ${result.budget.toFixed(0)} ${unit} |\n`,
    );
  }
  check(failed.length === 0, `Over budget: ${failed.map((result) => result.name).join(', ')}`);
}

function parseArgs(argv) {
  const options = { documents: 10_000, keep: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--documents') options.documents = Number(argv[++i]);
    else if (argv[i] === '--keep') options.keep = true;
    else throw new CheckError(`Unknown option ${argv[i]}`);
  }
  check(Number.isInteger(options.documents) && options.documents >= 100, '--documents ≥ 100');
  return options;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await run(parseArgs(process.argv.slice(2)));
    log('Performance check passed');
  } catch (error) {
    process.stderr.write(`✖ ${error instanceof CheckError ? error.message : error.stack}\n`);
    process.exit(1);
  }
}
