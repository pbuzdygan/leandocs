#!/usr/bin/env node
// Backup and restore check (P15-05, PROJECT_SPEC §74–75, §102–103 critical tests A and D).
//
// Uses a real installation of one image like an owner, then follows docs/deployment.md:
//   1. backup: stop, `tar -cpzf` the data folder, start; later changes must not survive a restore;
//   2. full restore into an empty folder (another server): account, authenticator app, sessions,
//      pins, trash, search and every file come back exactly as they were at backup time;
//   3. partial restore (system files without app.db) must refuse to start and must not reopen
//      account setup; restoring app.db as well makes it work again;
//   4. critical test D: only `content/`, copied while LeanDocs runs, makes a working new
//      installation with the same documents, ids, links, attachments and search;
//   5. critical test A: with no LeanDocs running, every document is a plain Markdown file whose
//      text is what the app shows, with its id in the front matter and its links resolvable.
//
// Usage: node scripts/backup-check.mjs --image <image> [--keep]
// Needs Docker and tar. Exits 1 with an ::error:: line on the first failed check.
import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  Instance,
  Client,
  USERNAME,
  check,
  cleanUp,
  flatten,
  freePort,
  hashTree,
  idByPath,
  log,
  runArgs,
  same,
  seed,
  setUpAccount,
  signIn,
} from './docker-harness.mjs';

/** Everything an owner sees, for comparisons between installations. */
async function snapshot(client, { withPins = true } = {}) {
  const tree = flatten(await client.ok('GET', '/tree'));
  const documents = {};
  for (const item of tree.filter((entry) => entry.id)) {
    const dto = await client.ok('GET', `/documents/${item.id}`);
    documents[item.id] = {
      path: dto.path,
      content: dto.content,
      frontmatterId: dto.frontmatter.id,
    };
  }
  return {
    tree,
    documents,
    pins: withPins ? (await client.ok('GET', '/pins')).items.map((pin) => pin.id) : undefined,
    trash: (await client.ok('GET', '/trash')).items.map((item) => [item.trashId, item.name]),
    attachments: (await client.ok('GET', '/documents/runbook/attachments')).items.map(
      (item) => item.name,
    ),
    backlinks: (await client.ok('GET', '/documents/runbook/backlinks')).items
      .map((link) => link.id)
      .sort(),
    search: (await client.ok('GET', '/search?q=zebracorn')).results.map((result) => result.id),
  };
}

function freshDataDir(label) {
  const dir = mkdtempSync(path.join(tmpdir(), `leandocs-${label}-`));
  chmodSync(dir, 0o700);
  return dir;
}

function tar(args) {
  execFileSync('tar', args, { stdio: 'pipe' });
}

async function run({ image, keep }) {
  const dirs = [];
  const running = [];
  const dir = (label) => {
    const created = freshDataDir(label);
    dirs.push(created);
    return created;
  };
  try {
    // An installation in daily use.
    const live = dir('live');
    mkdirSync(path.join(live, 'content'));
    seed(path.join(live, 'content'));
    let instance = await new Instance(image, live).start();
    running.push(instance);
    log(`${image} reports ${instance.version}`);
    let { client, authenticator } = await setUpAccount(instance.base);
    await client.ok('POST', '/documents', {
      name: 'Before backup',
      folder: 'Notes',
      content: 'Written before the backup. See [[Runbook]].\n',
    });
    await client.ok('PUT', '/pins/runbook');
    await client.ok('DELETE', '/documents/trash-me');
    const atBackup = await snapshot(client);
    const sessionCookies = new Map(client.cookies);

    // 1. Backup exactly as docs/deployment.md says: stop, archive, start.
    instance.stop();
    running.length = 0;
    const backupFiles = { content: hashTree(path.join(live, 'content')) };
    const archive = path.join(dir('archive'), 'leandocs-backup.tar.gz');
    tar(['-cpzf', archive, '-C', live, '.']);
    instance = await new Instance(image, live).start();
    running.push(instance);
    client = await signIn(instance.base, authenticator);
    await client.ok('POST', '/documents', {
      name: 'After backup',
      folder: 'Notes',
      content: 'x\n',
    });
    await client.ok('DELETE', '/pins/runbook');
    log(`Backup taken (${statSync(archive).size} bytes); changes made after it`);

    // 2. Full restore into an empty folder, as on another server.
    const restored = dir('restored');
    tar(['-xpzf', archive, '-C', restored]);
    const elsewhere = await new Instance(image, restored).start();
    running.push(elsewhere);
    same(
      hashTree(path.join(restored, 'content')),
      backupFiles.content,
      'Restored content differs from the backup',
    );
    const resumed = new Client(elsewhere.base, sessionCookies);
    check(
      (await resumed.refreshCsrf()).user?.username === USERNAME,
      'A session from before the backup is not valid after the restore',
    );
    const restoredClient = await signIn(elsewhere.base, authenticator);
    same(
      await snapshot(restoredClient),
      atBackup,
      'The restored installation differs from the backup',
    );
    check(
      !flatten(await restoredClient.ok('GET', '/tree')).some(
        (item) => item.path === 'Notes/After backup.md',
      ),
      'A document created after the backup appeared in the restore',
    );
    elsewhere.stop();
    running.splice(running.indexOf(elsewhere), 1);
    log(
      'Full restore: account, authenticator, session, pins, trash, search and files as backed up',
    );

    // 3. A partial restore must fail closed: no app.db, but the initialization marker.
    const partial = dir('partial');
    tar(['-xpzf', archive, '-C', partial]);
    rmSync(path.join(partial, 'system', 'app.db'));
    const port = await freePort();
    const name = `leandocs-partial-${process.pid}`;
    const refused = spawnSync('docker', ['run', '--name', name, ...runArgs(partial, port), image], {
      encoding: 'utf8',
      timeout: 120_000,
    });
    spawnSync('docker', ['rm', '-f', name]);
    check(
      refused.status !== 0 && refused.status !== null,
      `LeanDocs started after a partial restore (exit ${refused.status}); setup could reopen`,
    );
    check(
      /missing, invalid or corrupt/i.test(`${refused.stdout}${refused.stderr}`),
      `The refusal does not say why:\n${refused.stdout}${refused.stderr}`,
    );
    check(!existsSync(path.join(partial, 'system', 'app.db')), 'A new app.db was created');
    tar(['-xpzf', archive, '-C', partial, './system/app.db']);
    const repaired = await new Instance(image, partial).start();
    running.push(repaired);
    await signIn(repaired.base, authenticator);
    repaired.stop();
    running.splice(running.indexOf(repaired), 1);
    log('Partial restore refused with an explanation; restoring app.db as well fixes it');

    // 4. Critical test D: only content/, copied while LeanDocs runs, into a new installation.
    const current = await snapshot(client, { withPins: false });
    const moved = dir('content-only');
    cpSync(path.join(live, 'content'), path.join(moved, 'content'), {
      recursive: true,
      preserveTimestamps: true,
    });
    instance.stop();
    running.length = 0;
    const copied = hashTree(path.join(moved, 'content'));
    const fresh = await new Instance(image, moved).start();
    running.push(fresh);
    const second = await setUpAccount(fresh.base);
    same(
      await snapshot(second.client, { withPins: false }),
      current,
      'A new installation with only the content folder differs from the original',
    );
    same((await second.client.ok('GET', '/pins')).items, [], 'Pins are app data, not content');
    same(hashTree(path.join(moved, 'content')), copied, 'The new installation rewrote files');
    fresh.stop();
    running.length = 0;
    log(
      'Critical test D: content/ alone gives the same documents, ids, links, attachments, search',
    );

    // 5. Critical test A: no LeanDocs is running; the files alone hold the documentation.
    const content = path.join(live, 'content');
    for (const [id, document] of Object.entries(current.documents)) {
      const absolute = path.join(content, document.path);
      check(existsSync(absolute), `${document.path} is not on disk`);
      const bytes = readFileSync(absolute);
      const text = bytes.toString('utf8');
      check(
        text.endsWith(document.content),
        `${document.path} does not hold the text LeanDocs shows`,
      );
      if (document.frontmatterId !== undefined)
        check(
          new RegExp(`^(?:\\uFEFF)?---\\r?\\n(?:.*\\r?\\n)*?id: ${id}\\r?\\n`).test(text),
          `${document.path} does not carry its id ${id} in the front matter`,
        );
    }
    const runbook = current.documents.runbook;
    const target = /\]\(([^)]+\.txt)\)/.exec(runbook.content)?.[1];
    check(target, 'The sample document has no attachment link');
    check(
      existsSync(path.join(content, path.dirname(runbook.path), target)),
      `The attachment link ${target} does not resolve to a file next to the document`,
    );
    const runbookId = idByPath(current.tree, 'Infrastructure/Runbook.md');
    check(runbookId === 'runbook', 'Wiki link target lost its id');
    log(
      `Critical test A: ${Object.keys(current.documents).length} documents readable as plain files`,
    );
    log(`Backup and restore of ${image}: all checks passed`);
  } finally {
    cleanUp(running);
    if (keep) log(`Data kept in ${dirs.join(', ')}`);
    else for (const created of dirs) rmSync(created, { recursive: true, force: true });
  }
}

function parseArgs(argv) {
  const options = { keep: false };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--keep') options.keep = true;
    else if (arg === '--image') options.image = argv[++index];
    else throw new Error(`Unknown argument ${arg}`);
  }
  if (!options.image) throw new Error('Usage: backup-check.mjs --image <image> [--keep]');
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
