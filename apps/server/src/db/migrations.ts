import type Database from 'better-sqlite3';

/**
 * Ordered schema migrations (PROJECT_SPEC §63). The applied version is stored in
 * `PRAGMA user_version`, so the database file carries its own schema version.
 *
 * Rules: never edit or reorder a released migration; append a new one instead. Each migration runs
 * in its own transaction together with the version bump, so a failure leaves the previous version.
 */
export interface Migration {
  version: number;
  name: string;
  up: (db: Database.Database) => void;
}

export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: 'document index, tags, aliases, full-text search, settings',
    up: (db) => {
      db.exec(`
        -- Derived from the .md files; can be dropped and rebuilt at any time (ADR-0003).
        -- \`key\` is an explicit INTEGER PRIMARY KEY so it survives VACUUM; FTS rows use it as rowid.
        CREATE TABLE documents (
          key               INTEGER PRIMARY KEY,
          id                TEXT NOT NULL UNIQUE,
          id_source         TEXT NOT NULL CHECK (id_source IN ('frontmatter', 'provisional')),
          path              TEXT NOT NULL UNIQUE,
          filename          TEXT NOT NULL,
          title             TEXT NOT NULL,
          description       TEXT,
          created_at        TEXT,
          updated_at        TEXT,
          mtime_ms          REAL NOT NULL,
          size              INTEGER NOT NULL,
          content_hash      TEXT NOT NULL,
          -- Raw front matter \`id\` (JSON) and parse error, so a restart can resolve ids and report
          -- issues without re-reading unchanged files.
          frontmatter_id    TEXT,
          frontmatter_error TEXT
        );

        CREATE TABLE tags (
          id   INTEGER PRIMARY KEY,
          name TEXT NOT NULL UNIQUE COLLATE NOCASE
        );

        CREATE TABLE document_tags (
          document_key INTEGER NOT NULL REFERENCES documents (key) ON DELETE CASCADE,
          tag_id       INTEGER NOT NULL REFERENCES tags (id) ON DELETE CASCADE,
          PRIMARY KEY (document_key, tag_id)
        ) WITHOUT ROWID;
        CREATE INDEX document_tags_tag ON document_tags (tag_id);

        CREATE TABLE document_aliases (
          document_key INTEGER NOT NULL REFERENCES documents (key) ON DELETE CASCADE,
          alias        TEXT NOT NULL,
          PRIMARY KEY (document_key, alias)
        ) WITHOUT ROWID;
        CREATE INDEX document_aliases_alias ON document_aliases (alias COLLATE NOCASE);

        -- One row per document, rowid = documents.key; the indexer keeps both in step.
        -- remove_diacritics 2 lets "czesc" find "część"; prefixes speed up type-ahead.
        -- unicode61 cannot fold letters such as ł (not l + a mark), so \`folded\` repeats every
        -- word containing one in folded form ("źródło" → "źródlo"); queries are folded the same way.
        CREATE VIRTUAL TABLE documents_fts USING fts5 (
          title,
          aliases,
          tags,
          headings,
          filename,
          path,
          body,
          folded,
          tokenize = 'unicode61 remove_diacritics 2',
          prefix = '2 3'
        );

        -- Bookkeeping for the index itself (e.g. last full rebuild).
        CREATE TABLE index_meta (
          key   TEXT PRIMARY KEY,
          value TEXT NOT NULL
        ) WITHOUT ROWID;

        -- App-level settings (not derived; lost only if app.db is deleted).
        CREATE TABLE settings (
          key        TEXT PRIMARY KEY,
          value      TEXT NOT NULL,
          updated_at TEXT NOT NULL
        ) WITHOUT ROWID;
      `);
    },
  },
  {
    version: 2,
    name: 'document links; reindex',
    up: (db) => {
      db.exec(`
        -- Links between documents (PROJECT_SPEC §22–25), derived like the rest of the index.
        -- \`lookup\` is what backlink queries match: the normalised wiki target, or the normalised
        -- path a Markdown link resolves to. Resolution to a document happens at query time, so
        -- creating or renaming a target never requires rewriting other rows.
        CREATE TABLE links (
          source_key INTEGER NOT NULL REFERENCES documents (key) ON DELETE CASCADE,
          ordinal    INTEGER NOT NULL,
          kind       TEXT NOT NULL CHECK (kind IN ('wiki', 'markdown')),
          target     TEXT NOT NULL,
          lookup     TEXT NOT NULL,
          heading    TEXT,
          alias      TEXT,
          PRIMARY KEY (source_key, ordinal)
        ) WITHOUT ROWID;
        CREATE INDEX links_lookup ON links (lookup);

        -- Rows indexed by v1 have no links: drop the derived data so the next start re-reads
        -- every file. Settings are app data and stay.
        DELETE FROM documents_fts;
        DELETE FROM document_aliases;
        DELETE FROM document_tags;
        DELETE FROM documents;
        DELETE FROM tags;
      `);
    },
  },
  {
    version: 3,
    name: 'pinned documents',
    up: (db) => {
      db.exec(`
        -- Pins are application metadata, not derived data (PROJECT_SPEC §40): a rebuild keeps
        -- them, and a pin outlives a document in the trash so it comes back on restore.
        CREATE TABLE pins (
          document_id TEXT PRIMARY KEY,
          pinned_at   TEXT NOT NULL
        ) WITHOUT ROWID;
      `);
    },
  },
  {
    version: 4,
    name: 'administrator and sessions',
    up: (db) => {
      db.exec(`
        -- Version 1.0 is single-user (PROJECT_SPEC §48). Authentication is app data,
        -- so rebuilding the document index must never clear these tables.
        CREATE TABLE users (
          id            INTEGER PRIMARY KEY CHECK (id = 1),
          username      TEXT NOT NULL UNIQUE COLLATE NOCASE CHECK (length(trim(username)) > 0),
          password_hash TEXT NOT NULL CHECK (length(password_hash) > 0),
          created_at    TEXT NOT NULL
        );

        -- Only the SHA-256 digest of a random session token belongs in the database.
        -- Times are integer Unix seconds; expired rows are cleaned up by the auth service.
        CREATE TABLE sessions (
          token_hash TEXT PRIMARY KEY CHECK (
            length(token_hash) = 64 AND token_hash NOT GLOB '*[^0-9a-f]*'
          ),
          user_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
          created_at INTEGER NOT NULL CHECK (typeof(created_at) = 'integer' AND created_at >= 0),
          expires_at INTEGER NOT NULL CHECK (
            typeof(expires_at) = 'integer' AND expires_at > created_at
          )
        ) WITHOUT ROWID;
        CREATE INDEX sessions_user ON sessions (user_id);
        CREATE INDEX sessions_expiry ON sessions (expires_at);
      `);
    },
  },

  {
    version: 5,
    name: 'local MFA and one-use recovery codes',
    up: (db) => {
      db.exec(`
        CREATE TABLE user_mfa (
          user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE CHECK (user_id = 1),
          secret TEXT NOT NULL,
          last_step INTEGER NOT NULL CHECK (last_step >= 0)
        );
        CREATE TABLE mfa_recovery_codes (
          token_hash TEXT PRIMARY KEY CHECK (length(token_hash) = 64 AND token_hash NOT GLOB '*[^0-9a-f]*'),
          user_id INTEGER NOT NULL REFERENCES user_mfa(user_id) ON DELETE CASCADE
        ) WITHOUT ROWID;
      `);
    },
  },

  {
    version: 6,
    name: 'documents read as plain text',
    up: (db) => {
      // Why a document was too large or complex to analyse (ADR-0025); NULL when it was not.
      db.exec('ALTER TABLE documents ADD COLUMN analysis_limited TEXT');
    },
  },
  {
    version: 7,
    name: 'documents that are not UTF-8',
    up: (db) => {
      // 1 when the file is not valid UTF-8: listed, but never written by LeanDocs (P15-03).
      db.exec('ALTER TABLE documents ADD COLUMN not_utf8 INTEGER NOT NULL DEFAULT 0');
    },
  },
];

export const LATEST_SCHEMA_VERSION = MIGRATIONS.at(-1)?.version ?? 0;

export class SchemaVersionError extends Error {}

export interface MigrationResult {
  from: number;
  to: number;
  applied: string[];
}

/** Brings the database up to the latest schema. Refuses to run against a newer schema. */
export function migrate(
  db: Database.Database,
  migrations: readonly Migration[] = MIGRATIONS,
): MigrationResult {
  const from = db.pragma('user_version', { simple: true }) as number;
  const latest = migrations.at(-1)?.version ?? 0;
  if (from > latest)
    throw new SchemaVersionError(
      `Database schema version ${from} is newer than this LeanDocs version supports (${latest}). ` +
        'Upgrade LeanDocs or restore a compatible system backup. Do not delete app.db: authentication is durable app data.',
    );
  const applied: string[] = [];
  for (const migration of migrations) {
    if (migration.version <= from) continue;
    db.transaction(() => {
      migration.up(db);
      // PRAGMA cannot take bound parameters; the version is an integer from code.
      db.pragma(`user_version = ${Math.trunc(migration.version)}`);
    })();
    applied.push(`${migration.version}: ${migration.name}`);
  }
  return { from, to: Math.max(from, latest), applied };
}
