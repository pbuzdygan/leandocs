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
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  Client,
  Instance,
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
  schemaVersion,
  seed,
  setUpAccount,
  signIn,
} from './docker-harness.mjs';

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
    let { client, authenticator } = await setUpAccount(old.base);
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
    cleanUp(running);
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
