import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { makeTempDir, silentLogger } from '../test/temp-dir.js';
import { DATABASE_FILE, DatabaseRecoveryError, openDatabase } from './database.js';
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
