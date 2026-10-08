import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import Database from 'better-sqlite3';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { AUTH_INITIALIZED_FILE } from '../auth/initialized.js';
import { hashPassword } from '../auth/password.js';
import { loadConfig } from '../config/config.js';
import { buildApp } from '../test/authenticated-app.js';
import { makeTempDir, silentLogger } from '../test/temp-dir.js';
import { DATABASE_FILE, openDatabase } from './database.js';
import { LATEST_SCHEMA_VERSION, migrate, MIGRATIONS } from './migrations.js';

/**
 * Upgrade safety (P14-05). Installations update by starting a newer image on the same data
 * folder, so every released schema version must migrate forward without losing app data.
 */

/**
 * Schema created by each released migration. A changed value means a released migration was
 * edited: existing databases would never receive that change. Add a new migration instead.
 * FTS5 shadow tables are left out; SQLite generates their definitions.
 */
const RELEASED_SCHEMAS: Record<number, string> = {
  1: '3f5198f672f2',
  2: '41bd2c013775',
  3: 'd8a59d689383',
  4: 'f44c95489042',
  5: 'c6d07d813829',
  6: '2ba1cabd5694',
  7: 'ac7379b2aad1',
};

function schemaFingerprint(db: Database.Database): string {
  const objects = db
    .prepare(
      "SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE 'documents_fts_%' ORDER BY type, name",
    )
    .all();
  return createHash('sha256').update(JSON.stringify(objects)).digest('hex').slice(0, 12);
}

/** A database file as an older LeanDocs release left it. */
function databaseAt(file: string, version: number): Database.Database {
  const db = new Database(file);
  migrate(db, MIGRATIONS.slice(0, version));
  expect(db.pragma('user_version', { simple: true })).toBe(version);
  return db;
}

const apps: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe('database upgrades', () => {
  it('never change a released migration', () => {
    const db = new Database(':memory:');
    const actual: Record<number, string> = {};
    for (const migration of MIGRATIONS) {
      migrate(db, MIGRATIONS.slice(0, migration.version));
      actual[migration.version] = schemaFingerprint(db);
    }
    // New migrations are appended to RELEASED_SCHEMAS when they are released.
    expect(
      Object.fromEntries(
        Object.entries(actual).filter(([version]) => (+version) in RELEASED_SCHEMAS),
      ),
      'A released migration was edited. Never change migrations that shipped; add a new one.',
    ).toEqual(RELEASED_SCHEMAS);
  });

  it.each(MIGRATIONS.slice(0, -1).map((migration) => migration.version))(
    'upgrades a version %i database to the latest schema and keeps its app data',
    async (version) => {
      const dir = await makeTempDir();
      const old = databaseAt(path.join(dir, DATABASE_FILE), version);
      old
        .prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)')
        .run('editor.mode', '"source"', '2026-01-01T00:00:00Z');
      if (version >= 3)
        old.prepare('INSERT INTO pins (document_id, pinned_at) VALUES (?, ?)').run('doc-1', 'x');
      if (version >= 4) {
        old
          .prepare(
            'INSERT INTO users (id, username, password_hash, created_at) VALUES (1, ?, ?, ?)',
          )
          .run('admin', 'hash', '2026-01-01T00:00:00Z');
        old
          .prepare(
            'INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, 1, 1, 2)',
          )
          .run('a'.repeat(64));
      }
      if (version >= 5) {
        old.prepare('INSERT INTO user_mfa (user_id, secret, last_step) VALUES (1, ?, 7)').run('s');
        old
          .prepare('INSERT INTO mfa_recovery_codes (token_hash, user_id) VALUES (?, 1)')
          .run('b'.repeat(64));
      }
      // Derived index rows: kept from version 2 on (version 2 empties the index for a re-read).
      old
        .prepare(
          `INSERT INTO documents (key, id, id_source, path, filename, title, mtime_ms, size,
             content_hash) VALUES (1, 'doc-1', 'frontmatter', 'A.md', 'A', 'A', 5, 1, 'sha256:x')`,
        )
        .run();
      old.prepare("INSERT INTO tags (id, name) VALUES (1, 'ops')").run();
      old.prepare('INSERT INTO document_tags (document_key, tag_id) VALUES (1, 1)').run();
      old.prepare("INSERT INTO documents_fts (rowid, title, body) VALUES (1, 'A', 'quokka')").run();
      if (version >= 2)
        old
          .prepare(
            "INSERT INTO links (source_key, ordinal, kind, target, lookup) VALUES (1, 0, 'wiki', 'B', 'b')",
          )
          .run();
      old.close();

      const db = openDatabase(dir, silentLogger);
      try {
        expect(db.pragma('user_version', { simple: true })).toBe(LATEST_SCHEMA_VERSION);
        expect(db.prepare('SELECT value FROM settings WHERE key = ?').get('editor.mode')).toEqual({
          value: '"source"',
        });
        expect(db.prepare('SELECT COUNT(*) AS n FROM pins').get()).toEqual({
          n: version >= 3 ? 1 : 0,
        });
        expect(db.prepare('SELECT username FROM users').all()).toEqual(
          version >= 4 ? [{ username: 'admin' }] : [],
        );
        expect(db.prepare('SELECT COUNT(*) AS n FROM sessions').get()).toEqual({
          n: version >= 4 ? 1 : 0,
        });
        expect(db.prepare('SELECT last_step FROM user_mfa').all()).toEqual(
          version >= 5 ? [{ last_step: 7 }] : [],
        );
        expect(db.prepare('SELECT COUNT(*) AS n FROM mfa_recovery_codes').get()).toEqual({
          n: version >= 5 ? 1 : 0,
        });
        // Index rows survive (except the deliberate v2 reset); migration 8 only forces a re-read.
        const indexed = version >= 2 ? 1 : 0;
        expect(db.prepare('SELECT id, mtime_ms FROM documents').all()).toEqual(
          indexed ? [{ id: 'doc-1', mtime_ms: -1 }] : [],
        );
        expect(db.prepare('SELECT COUNT(*) AS n FROM document_tags').get()).toEqual({ n: indexed });
        expect(
          db
            .prepare("SELECT COUNT(*) AS n FROM documents_fts WHERE documents_fts MATCH 'quokka'")
            .get(),
        ).toEqual({ n: indexed });
        expect(db.prepare('SELECT COUNT(*) AS n FROM links').get()).toEqual({ n: indexed });
        expect(db.pragma('foreign_key_check')).toEqual([]);
        expect(db.pragma('integrity_check', { simple: true })).toBe('ok');
      } finally {
        db.close();
      }
    },
  );

  it('starts the app on a pre-MFA installation: sign-in, pins and documents still work', async () => {
    const root = await makeTempDir();
    const system = path.join(root, 'system');
    const content = path.join(root, 'content');
    await mkdir(system, { recursive: true });
    await mkdir(content, { recursive: true });
    await writeFile(
      path.join(content, 'Runbook.md'),
      '---\nid: runbook-id\ntitle: Runbook\n---\n\n# Runbook\n\nRestart the quokkarouter.\n',
    );
    // Version 4 schema with the account and a pin, as left by an installation before MFA and
    // before the initialization marker existed.
    const old = databaseAt(path.join(system, DATABASE_FILE), 4);
    old
      .prepare('INSERT INTO users (id, username, password_hash, created_at) VALUES (1, ?, ?, ?)')
      .run(
        'test-admin',
        await hashPassword('test administrator passphrase'),
        '2026-01-01T00:00:00Z',
      );
    old.prepare('INSERT INTO pins (document_id, pinned_at) VALUES (?, ?)').run('runbook-id', 'x');
    old.close();

    // The test helper signs in with this account; it throws if sign-in fails.
    const app = await buildApp(loadConfig({ DATA_DIR: root, LOG_LEVEL: 'silent' }));
    apps.push(app);
    expect((await app.inject('/api/v1/pins')).json().items).toEqual([
      expect.objectContaining({ id: 'runbook-id', title: 'Runbook' }),
    ]);
    expect((await app.inject('/api/v1/search?q=quokkarouter&limit=5')).json().results).toEqual([
      expect.objectContaining({ id: 'runbook-id' }),
    ]);
    expect((await app.inject('/api/v1/auth/mfa/status')).json()).toMatchObject({ enabled: false });
    // The existing account was adopted: a later loss of app.db cannot reopen setup.
    expect(existsSync(path.join(system, AUTH_INITIALIZED_FILE))).toBe(true);
    await app.close();
    apps.length = 0;

    const upgraded = new Database(path.join(system, DATABASE_FILE), { readonly: true });
    expect(upgraded.pragma('user_version', { simple: true })).toBe(LATEST_SCHEMA_VERSION);
    upgraded.close();
  });

  it('re-reads documents indexed before the encoding check (migration 8)', async () => {
    const root = await makeTempDir();
    const content = path.join(root, 'content');
    await mkdir(content, { recursive: true });
    // "# Zródło" in Windows-1250, with an id, so no release ever rewrote it.
    const legacy = Buffer.from('---\nid: legacy\n---\n# Zr\xf3d\xb3o\n', 'latin1');
    await writeFile(path.join(content, 'Legacy.md'), legacy);
    const config = loadConfig({ DATA_DIR: root, LOG_LEVEL: 'silent' });
    let app = await buildApp(config);
    await app.close();

    // What a release before version 7 left behind: the row exists, the file was never checked.
    const db = new Database(path.join(root, 'system', DATABASE_FILE));
    db.prepare('UPDATE documents SET not_utf8 = 0').run();
    db.pragma('user_version = 7');
    db.close();

    app = await buildApp(config);
    apps.push(app);
    expect((await app.inject('/api/v1/index/status')).json().issues).toEqual([
      expect.objectContaining({ code: 'NOT_UTF8', path: 'Legacy.md' }),
    ]);
    expect((await app.inject('/api/v1/documents/legacy')).json()).toMatchObject({
      id: 'legacy',
      notUtf8: true,
    });
  });
});
