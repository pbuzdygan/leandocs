import { fork } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { chmod, readdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { makeTempDir, silentLogger } from '../test/temp-dir.js';
import {
  DATABASE_FILE,
  DatabaseAccessError,
  DatabaseRecoveryError,
  openDatabase,
} from './database.js';
import { LATEST_SCHEMA_VERSION, migrate, MIGRATIONS, SchemaVersionError } from './migrations.js';

function tables(db: Database.Database): string[] {
  return (
    db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as {
      name: string;
    }[]
  ).map((row) => row.name);
}

describe('migrations', () => {
  it('have strictly increasing versions starting at 1', () => {
    expect(MIGRATIONS.map((m) => m.version)).toEqual(MIGRATIONS.map((_, index) => index + 1));
    expect(LATEST_SCHEMA_VERSION).toBe(MIGRATIONS.length);
  });

  it('create the schema and record the version', () => {
    const db = new Database(':memory:');
    const result = migrate(db);
    expect(result).toMatchObject({ from: 0, to: LATEST_SCHEMA_VERSION });
    expect(db.pragma('user_version', { simple: true })).toBe(LATEST_SCHEMA_VERSION);
    expect(tables(db)).toEqual(
      expect.arrayContaining([
        'documents',
        'tags',
        'document_tags',
        'document_aliases',
        'documents_fts',
        'index_meta',
        'settings',
      ]),
    );
  });

  it('are idempotent', () => {
    const db = new Database(':memory:');
    migrate(db);
    expect(migrate(db).applied).toEqual([]);
  });

  it('apply only pending migrations, each in its own transaction', () => {
    const db = new Database(':memory:');
    const steps = [
      { version: 1, name: 'a', up: (d: Database.Database) => d.exec('CREATE TABLE a (x)') },
      { version: 2, name: 'b', up: (d: Database.Database) => d.exec('CREATE TABLE b (x); BAD') },
    ];
    expect(() => migrate(db, steps)).toThrow();
    // Migration 1 committed; the failed migration 2 left nothing behind.
    expect(db.pragma('user_version', { simple: true })).toBe(1);
    expect(tables(db)).toEqual(['a']);
    steps[1] = { version: 2, name: 'b', up: (d) => d.exec('CREATE TABLE b (x)') };
    expect(migrate(db, steps).applied).toEqual(['2: b']);
  });

  it('refuse a schema newer than the code', () => {
    const db = new Database(':memory:');
    db.pragma(`user_version = ${LATEST_SCHEMA_VERSION + 1}`);
    expect(() => migrate(db)).toThrow(SchemaVersionError);
  });

  it('search with diacritic folding and prefixes', () => {
    const db = new Database(':memory:');
    migrate(db);
    db.prepare('INSERT INTO documents_fts (rowid, title, body) VALUES (?, ?, ?)').run(
      1,
      'Część zapasowa',
      'macvlan-shim used for host communication',
    );
    const match = (query: string) =>
      db.prepare('SELECT rowid FROM documents_fts WHERE documents_fts MATCH ?').all(query);
    expect(match('czesc')).toHaveLength(1);
    // unicode61 does not fold ł → l (a separate letter, not l + a mark); see P8-03.
    expect(match('macv*')).toHaveLength(1);
    expect(match('nothing')).toHaveLength(0);
  });
});

describe('openDatabase', () => {
  it('creates app.db in the system directory with WAL and foreign keys', async () => {
    const dir = await makeTempDir();
    const db = openDatabase(dir, silentLogger);
    try {
      expect(db.name).toBe(path.join(dir, DATABASE_FILE));
      expect(db.pragma('journal_mode', { simple: true })).toBe('wal');
      expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
      expect(db.pragma('user_version', { simple: true })).toBe(LATEST_SCHEMA_VERSION);
    } finally {
      db.close();
    }
  });

  it('keeps data across reopen', async () => {
    const dir = await makeTempDir();
    const first = openDatabase(dir, silentLogger);
    first.prepare("INSERT INTO settings VALUES ('k', 'v', 'now')").run();
    first.close();
    const second = openDatabase(dir, silentLogger);
    expect(second.prepare('SELECT value FROM settings').get()).toEqual({ value: 'v' });
    second.close();
  });

  it('refuses an unreadable file without renaming or replacing the database or sidecars', async () => {
    const dir = await makeTempDir();
    const garbage = 'this is not a database'.repeat(100);
    await writeFile(path.join(dir, DATABASE_FILE), garbage);
    await writeFile(path.join(dir, 'app.db-wal'), 'preserved WAL');
    await writeFile(path.join(dir, 'app.db-shm'), 'preserved SHM');
    expect(() => openDatabase(dir, silentLogger)).toThrow(DatabaseRecoveryError);
    expect(await readFile(path.join(dir, DATABASE_FILE), 'utf8')).toBe(garbage);
    expect(await readFile(path.join(dir, 'app.db-wal'), 'utf8')).toBe('preserved WAL');
    expect(await readFile(path.join(dir, 'app.db-shm'), 'utf8')).toBe('preserved SHM');
    expect((await readdir(dir)).some((name) => name.includes('corrupt-'))).toBe(false);
  });

  it('does not touch a database with a newer schema', async () => {
    const dir = await makeTempDir();
    const newer = new Database(path.join(dir, DATABASE_FILE));
    newer.pragma(`user_version = ${LATEST_SCHEMA_VERSION + 5}`);
    newer.close();
    expect(() => openDatabase(dir, silentLogger)).toThrow(SchemaVersionError);
    expect(await readdir(dir)).not.toContainEqual(expect.stringMatching(/corrupt/));
  });
});

/** P15-06: a migration that cannot finish leaves the previous, working database behind. */
describe('interrupted and blocked migrations', () => {
  const isRoot = process.getuid?.() === 0;

  /** A database one version behind, holding an account, a setting and an index row. */
  async function previousVersion(): Promise<{ dir: string; file: string }> {
    const dir = await makeTempDir();
    const file = path.join(dir, DATABASE_FILE);
    const db = new Database(file);
    db.pragma('journal_mode = WAL');
    migrate(db, MIGRATIONS.slice(0, -1));
    db.prepare("INSERT INTO settings VALUES ('editor.mode', '\"source\"', 'now')").run();
    db.prepare(
      "INSERT INTO users (id, username, password_hash, created_at) VALUES (1, 'admin', 'h', 'now')",
    ).run();
    db.prepare(
      `INSERT INTO documents (key, id, id_source, path, filename, title, mtime_ms, size,
         content_hash) VALUES (1, 'doc-1', 'frontmatter', 'A.md', 'A', 'A', 5, 1, 'sha256:x')`,
    ).run();
    db.close();
    return { dir, file };
  }

  function expectPreviousData(db: Database.Database): void {
    expect(db.prepare('SELECT username FROM users').all()).toEqual([{ username: 'admin' }]);
    expect(db.prepare('SELECT value FROM settings').all()).toEqual([{ value: '"source"' }]);
    expect(db.pragma('integrity_check', { simple: true })).toBe('ok');
  }

  it('rolls back a migration killed mid-way; the next start migrates normally', async () => {
    const { dir, file } = await previousVersion();
    const fixture = fileURLToPath(new URL('./interrupted-migration.fixture.ts', import.meta.url));
    const tsx = pathToFileURL(createRequire(import.meta.url).resolve('tsx')).href;
    const child = fork(fixture, [file], {
      execArgv: ['--import', tsx],
      stdio: ['ignore', 'pipe', 'inherit', 'ipc'],
    });
    await new Promise<void>((resolve, reject) => {
      child.once('exit', (code) => reject(new Error(`Fixture exited early (${code})`)));
      child.stdout!.on('data', (data: Buffer) => {
        if (data.toString().includes('inside')) resolve();
      });
    });
    // The uncommitted migration has reached the WAL file: a power cut or `kill -9` now.
    expect(existsSync(`${file}-wal`)).toBe(true);
    child.removeAllListeners('exit');
    const exited = new Promise((resolve) => child.once('exit', resolve));
    child.kill('SIGKILL');
    await exited;

    const before = new Database(file, { readonly: true });
    expect(before.pragma('user_version', { simple: true })).toBe(LATEST_SCHEMA_VERSION - 1);
    expect(tables(before)).not.toContain('interrupted');
    expectPreviousData(before);
    before.close();

    const db = openDatabase(dir, silentLogger);
    try {
      expect(db.pragma('user_version', { simple: true })).toBe(LATEST_SCHEMA_VERSION);
      expectPreviousData(db);
      expect(db.prepare('SELECT mtime_ms FROM documents').get()).toEqual({ mtime_ms: -1 });
    } finally {
      db.close();
    }
  });

  it.skipIf(isRoot)(
    'stops with an explanation and no changes when app.db is read-only',
    async () => {
      const { dir, file } = await previousVersion();
      const digest = async () =>
        createHash('sha256')
          .update(await readFile(file))
          .digest('hex');
      const original = await digest();
      // Restored with the wrong owner or onto a read-only volume: the migration cannot commit.
      await chmod(file, 0o444);
      try {
        expect(() => openDatabase(dir, silentLogger)).toThrow(DatabaseAccessError);
        expect(() => openDatabase(dir, silentLogger)).toThrow(/may not write app\.db/);
        // No sidecar files that would keep blocking after app.db is fixed.
        expect(await readdir(dir)).toEqual([DATABASE_FILE]);
      } finally {
        await chmod(file, 0o644);
      }
      expect(await digest()).toBe(original);
      const db = openDatabase(dir, silentLogger);
      try {
        expect(db.pragma('user_version', { simple: true })).toBe(LATEST_SCHEMA_VERSION);
        expectPreviousData(db);
      } finally {
        db.close();
      }
    },
  );

  it.skipIf(isRoot)('names read-only leftovers of an earlier failed start', async () => {
    const { dir, file } = await previousVersion();
    await writeFile(`${file}-wal`, '');
    await chmod(`${file}-wal`, 0o444);
    try {
      expect(() => openDatabase(dir, silentLogger)).toThrow(/may not write app\.db-wal/);
    } finally {
      await chmod(`${file}-wal`, 0o644);
    }
    openDatabase(dir, silentLogger).close();
  });
});
