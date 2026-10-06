import path from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { DATABASE_FILE, openDatabase } from '../db/database.js';
import { migrate, MIGRATIONS } from '../db/migrations.js';
import { IndexStore } from '../documents/index-store.js';
import { makeTempDir, silentLogger } from '../test/temp-dir.js';
import { hashPassword, verifyPassword } from './password.js';

describe('authentication storage', () => {
  it('upgrades schema 3 without losing indexed documents, settings or pins', async () => {
    const dir = await makeTempDir();
    const old = new Database(path.join(dir, DATABASE_FILE));
    try {
      migrate(old, MIGRATIONS.slice(0, 3));
      old.exec(`
        INSERT INTO settings VALUES ('theme', 'dark', 'now');
        INSERT INTO pins VALUES ('document-1', 'now');
        INSERT INTO documents (
          id, id_source, path, filename, title, mtime_ms, size, content_hash
        ) VALUES ('document-1', 'frontmatter', 'Guide.md', 'Guide.md', 'Guide', 1, 1, 'hash');
      `);
    } finally {
      old.close();
    }
    const upgraded = openDatabase(dir, silentLogger);
    try {
      expect(upgraded.pragma('user_version', { simple: true })).toBe(5);
      expect(upgraded.prepare('SELECT title FROM documents').get()).toEqual({ title: 'Guide' });
      expect(upgraded.prepare('SELECT value FROM settings').get()).toEqual({ value: 'dark' });
      expect(upgraded.prepare('SELECT document_id FROM pins').get()).toEqual({
        document_id: 'document-1',
      });
      expect(upgraded.prepare('SELECT * FROM users').all()).toEqual([]);
      expect(upgraded.prepare('SELECT * FROM sessions').all()).toEqual([]);
      expect(migrate(upgraded).applied).toEqual([]);
    } finally {
      upgraded.close();
    }
  });

  it('keeps credentials and sessions across index clearing and database reopen', async () => {
    const dir = await makeTempDir();
    const hash = await hashPassword('administrator password');
    const tokenHash = 'a'.repeat(64);
    const db = openDatabase(dir, silentLogger);
    try {
      db.prepare('INSERT INTO users VALUES (1, ?, ?, ?)').run('admin', hash, 'now');
      db.prepare('INSERT INTO sessions VALUES (?, 1, 100, 200)').run(tokenHash);
      new IndexStore(db).clear();
    } finally {
      db.close();
    }
    const reopened = openDatabase(dir, silentLogger);
    try {
      const user = reopened.prepare('SELECT password_hash FROM users').get() as {
        password_hash: string;
      };
      expect(await verifyPassword('administrator password', user.password_hash)).toBe(true);
      expect(reopened.prepare('SELECT * FROM sessions').all()).toEqual([
        { token_hash: tokenHash, user_id: 1, created_at: 100, expires_at: 200 },
      ]);
      reopened.prepare('DELETE FROM users WHERE id = 1').run();
      expect(reopened.prepare('SELECT * FROM sessions').all()).toEqual([]);
    } finally {
      reopened.close();
    }
  });

  it('enforces a single administrator, valid token digests, expiry and session ownership', async () => {
    const dir = await makeTempDir();
    const db = openDatabase(dir, silentLogger);
    try {
      const user = db.prepare('INSERT INTO users VALUES (?, ?, ?, ?)');
      expect(() => user.run(1, ' ', 'hash', 'now')).toThrow();
      expect(() => user.run(1, 'admin', '', 'now')).toThrow();
      user.run(1, 'admin', 'hash', 'now');
      expect(() => user.run(2, 'other', 'hash', 'now')).toThrow();
      const session = db.prepare('INSERT INTO sessions VALUES (?, ?, ?, ?)');
      expect(() => session.run('a'.repeat(64), 2, 100, 200)).toThrow();
      expect(() => session.run('a'.repeat(64), 1, 100, 100)).toThrow();
      expect(() => session.run('a'.repeat(64), 1, 100, 99)).toThrow();
      expect(() => session.run('a'.repeat(64), 1, -1, 200)).toThrow();
      expect(() => session.run('a'.repeat(64), 1, 'invalid', 200)).toThrow();
      expect(() => session.run('a'.repeat(64), 1, 100, 'invalid')).toThrow();
      expect(() => session.run('raw-session-token', 1, 100, 200)).toThrow();
      expect(() => session.run('g'.repeat(64), 1, 100, 200)).toThrow();
      session.run('a'.repeat(64), 1, 100, 200);
      expect(() => session.run('a'.repeat(64), 1, 100, 300)).toThrow();
    } finally {
      db.close();
    }
  });
});
