import type Database from 'better-sqlite3';
import { folderOf, linkKey, resolveRelativePath, type ExtractedLink } from '@leandocs/shared';
import { foldedVariants } from '../search/fold.js';

/** Everything the index stores about one document (PROJECT_SPEC §63). */
export interface IndexRecord {
  id: string;
  idSource: 'frontmatter' | 'provisional';
  path: string;
  filename: string;
  title: string;
  description: string | undefined;
  createdAt: string | undefined;
  updatedAt: string | undefined;
  mtimeMs: number;
  size: number;
  contentHash: string;
  /** Raw front matter `id` value (any YAML type) — kept so ids can be re-resolved on restart. */
  frontmatterId: unknown;
  frontmatterError: string | undefined;
  tags: string[];
  aliases: string[];
  /** Document links in source order (P9-01); resolved at query time. */
  links: ExtractedLink[];
  headings: string[];
  /** Folder part of the path, as indexed for search. */
  folder: string;
  /** File name without `.md`, as indexed for search. */
  stem: string;
  /** Plain body text for full-text search. */
  body: string;
  /** Set when the body was too large or complex to analyse (ADR-0025): why, for the issue. */
  analysisLimited: string | undefined;
}

/** The subset of a stored row needed to resume without re-reading unchanged files. */
export interface StoredDocument {
  id: string;
  idSource: 'frontmatter' | 'provisional';
  path: string;
  title: string;
  aliases: string[];
  mtimeMs: number;
  size: number;
  frontmatterId: unknown;
  contentHash: string;
  frontmatterError: string | undefined;
  analysisLimited: string | undefined;
}

/** A stored link with its source document (P9-03/P9-04). */
export interface StoredLink {
  sourceId: string;
  sourcePath: string;
  ordinal: number;
  link: ExtractedLink;
}

interface LinkRow {
  source_id: string;
  source_path: string;
  ordinal: number;
  kind: 'wiki' | 'markdown';
  target: string;
  heading: string | null;
  alias: string | null;
}

interface DocumentRow {
  content_hash: string;
  id: string;
  id_source: 'frontmatter' | 'provisional';
  path: string;
  title: string;
  mtime_ms: number;
  size: number;
  frontmatter_id: string | null;
  frontmatter_error: string | null;
  analysis_limited: string | null;
  aliases: string;
}

/**
 * SQLite persistence for the document index. All writes for one refresh happen in a single
 * transaction, so the tables, tags, aliases and the FTS rows never disagree.
 */
export class IndexStore {
  private readonly statements;

  constructor(readonly db: Database.Database) {
    this.statements = {
      keyByPath: db.prepare<[string], { key: number }>('SELECT key FROM documents WHERE path = ?'),
      deleteFts: db.prepare<[number]>('DELETE FROM documents_fts WHERE rowid = ?'),
      deleteDocument: db.prepare<[number]>('DELETE FROM documents WHERE key = ?'),
      insertDocument: db.prepare(
        `INSERT INTO documents (id, id_source, path, filename, title, description, created_at,
           updated_at, mtime_ms, size, content_hash, frontmatter_id, frontmatter_error,
           analysis_limited)
         VALUES (@id, @idSource, @path, @filename, @title, @description, @createdAt, @updatedAt,
           @mtimeMs, @size, @contentHash, @frontmatterId, @frontmatterError, @analysisLimited)`,
      ),
      insertTag: db.prepare<[string]>('INSERT OR IGNORE INTO tags (name) VALUES (?)'),
      tagId: db.prepare<[string], { id: number }>('SELECT id FROM tags WHERE name = ?'),
      linkTag: db.prepare<[number, number]>(
        'INSERT OR IGNORE INTO document_tags (document_key, tag_id) VALUES (?, ?)',
      ),
      insertLink: db.prepare(
        `INSERT INTO links (source_key, ordinal, kind, target, lookup, heading, alias)
         VALUES (@sourceKey, @ordinal, @kind, @target, @lookup, @heading, @alias)`,
      ),
      insertAlias: db.prepare<[number, string]>(
        'INSERT OR IGNORE INTO document_aliases (document_key, alias) VALUES (?, ?)',
      ),
      insertFts: db.prepare(
        `INSERT INTO documents_fts (rowid, title, aliases, tags, headings, filename, path, body, folded)
         VALUES (@key, @title, @aliases, @tags, @headings, @filename, @path, @body, @folded)`,
      ),
      deleteOrphanTags: db.prepare(
        'DELETE FROM tags WHERE id NOT IN (SELECT tag_id FROM document_tags)',
      ),
      setMeta: db.prepare<[string, string]>(
        'INSERT INTO index_meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
      ),
      getMeta: db.prepare<[string], { value: string }>(
        'SELECT value FROM index_meta WHERE key = ?',
      ),
    };
  }

  documents(): StoredDocument[] {
    const rows = this.db
      .prepare<[], DocumentRow>(
        `SELECT id, id_source, path, title, mtime_ms, size, content_hash, frontmatter_id, frontmatter_error,
           analysis_limited,
           (SELECT json_group_array(alias) FROM document_aliases a WHERE a.document_key = d.key)
             AS aliases
         FROM documents d`,
      )
      .all();
    return rows.map((row) => ({
      id: row.id,
      idSource: row.id_source,
      path: row.path,
      title: row.title,
      aliases: JSON.parse(row.aliases) as string[],
      mtimeMs: row.mtime_ms,
      size: row.size,
      contentHash: row.content_hash,
      frontmatterId: row.frontmatter_id === null ? undefined : JSON.parse(row.frontmatter_id),
      frontmatterError: row.frontmatter_error ?? undefined,
      analysisLimited: row.analysis_limited ?? undefined,
    }));
  }

  /** Removes the rows at `remove` (paths), then inserts `upsert`, in one transaction. */
  apply(remove: Iterable<string>, upsert: readonly IndexRecord[]): void {
    const s = this.statements;
    this.db.transaction(() => {
      for (const path of new Set([...remove, ...upsert.map((record) => record.path)])) {
        const row = s.keyByPath.get(path);
        if (!row) continue;
        s.deleteFts.run(row.key);
        s.deleteDocument.run(row.key); // cascades to tags and aliases
      }
      for (const record of upsert) {
        const key = Number(
          s.insertDocument.run({
            ...record,
            description: record.description ?? null,
            createdAt: record.createdAt ?? null,
            updatedAt: record.updatedAt ?? null,
            frontmatterId:
              record.frontmatterId === undefined ? null : JSON.stringify(record.frontmatterId),
            frontmatterError: record.frontmatterError ?? null,
            analysisLimited: record.analysisLimited ?? null,
          }).lastInsertRowid,
        );
        for (const tag of record.tags) {
          s.insertTag.run(tag);
          s.linkTag.run(key, s.tagId.get(tag)!.id);
        }
        for (const alias of record.aliases) s.insertAlias.run(key, alias);
        record.links.forEach((link, ordinal) =>
          s.insertLink.run(linkRow(key, ordinal, link, record.path)),
        );
        const fts = {
          key,
          title: clean(record.title),
          aliases: clean(record.aliases.join('\n')),
          tags: clean(record.tags.join('\n')),
          headings: clean(record.headings.join('\n')),
          filename: clean(record.stem),
          path: clean(record.folder),
          body: clean(record.body),
        };
        s.insertFts.run({
          ...fts,
          folded: foldedVariants(
            fts.title,
            fts.aliases,
            fts.tags,
            fts.headings,
            fts.filename,
            fts.path,
            fts.body,
          ),
        });
      }
      s.deleteOrphanTags.run();
    })();
  }

  /** Drops every derived row (PROJECT_SPEC §31 step 1). Settings are app data and stay. */
  clear(): void {
    this.db.transaction(() => {
      this.db.exec(
        'DELETE FROM documents_fts; DELETE FROM links; DELETE FROM document_aliases; DELETE FROM document_tags; DELETE FROM documents; DELETE FROM tags;',
      );
    })();
  }

  /**
   * Stored links, optionally only those of one source document or only those that could point
   * at one of `lookups` (backlink candidates; the caller verifies them with the resolver).
   */
  links(
    filter: { sourceId?: string; lookups?: string[]; lookupPrefixes?: string[] } = {},
  ): StoredLink[] {
    const where: string[] = [];
    const params: string[] = [];
    if (filter.sourceId !== undefined) {
      where.push('d.id = ?');
      params.push(filter.sourceId);
    }
    if (filter.lookups || filter.lookupPrefixes) {
      // Exact lookups OR any of the prefixes (folder moves).
      const any: string[] = [];
      if (filter.lookups?.length) {
        any.push(`l.lookup IN (${filter.lookups.map(() => '?').join(', ')})`);
        params.push(...filter.lookups);
      }
      for (const prefix of filter.lookupPrefixes ?? []) {
        any.push("l.lookup LIKE ? ESCAPE '\\'");
        params.push(`${prefix.replace(/[\\%_]/g, (character) => `\\${character}`)}%`);
      }
      if (any.length === 0) return [];
      where.push(`(${any.join(' OR ')})`);
    }
    const rows = this.db
      .prepare<string[], LinkRow>(
        `SELECT d.id AS source_id, d.path AS source_path, l.ordinal, l.kind, l.target, l.heading,
           l.alias
         FROM links l JOIN documents d ON d.key = l.source_key
         ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
         ORDER BY d.path, l.ordinal`,
      )
      .all(...params);
    return rows.map((row) => ({
      sourceId: row.source_id,
      sourcePath: row.source_path,
      ordinal: row.ordinal,
      link: toLink(row),
    }));
  }

  /** All tags with their document counts, by name (P10-03 autocomplete). */
  tags(): { name: string; count: number }[] {
    return this.db
      .prepare<[], { name: string; count: number }>(
        `SELECT t.name, count(*) AS count FROM tags t
         JOIN document_tags dt ON dt.tag_id = t.id
         GROUP BY t.id ORDER BY t.name COLLATE NOCASE`,
      )
      .all();
  }

  setMeta(key: string, value: string): void {
    this.statements.setMeta.run(key, value);
  }

  getMeta(key: string): string | undefined {
    return this.statements.getMeta.get(key)?.value;
  }
}

/** Removes the control characters the search service uses as snippet markers. */
function clean(text: string): string {
  return text.replaceAll('\u0002', '').replaceAll('\u0003', '');
}

/**
 * The `links` row for one extracted link. `lookup` is the key a backlink query searches for:
 * the normalised wiki target, or the normalised path a Markdown link resolves to from its source.
 */
function linkRow(sourceKey: number, ordinal: number, link: ExtractedLink, sourcePath: string) {
  const lookup =
    link.kind === 'wiki'
      ? linkKey(link.target)
      : linkKey(resolveRelativePath(folderOf(sourcePath), link.path) ?? '');
  return {
    sourceKey,
    ordinal,
    kind: link.kind,
    target: link.kind === 'wiki' ? link.target : link.href,
    lookup,
    heading: link.kind === 'wiki' ? (link.heading ?? null) : (link.fragment ?? null),
    alias: link.kind === 'wiki' ? (link.alias ?? null) : null,
  };
}

function toLink(row: LinkRow): ExtractedLink {
  if (row.kind === 'wiki') {
    const link: ExtractedLink = { kind: 'wiki', target: row.target };
    if (row.heading) link.heading = row.heading;
    if (row.alias) link.alias = row.alias;
    return link;
  }
  const hash = row.target.indexOf('#');
  const rawPath = hash === -1 ? row.target : row.target.slice(0, hash);
  let decoded = rawPath;
  try {
    decoded = decodeURIComponent(rawPath);
  } catch {
    // stored links were decodable when they were indexed
  }
  const link: ExtractedLink = { kind: 'markdown', href: row.target, path: decoded };
  if (row.heading) link.fragment = row.heading;
  return link;
}
