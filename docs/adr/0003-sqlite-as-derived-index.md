# ADR-0003: SQLite (FTS5) is a derived, rebuildable index

- **Status:** Accepted
- **Date:** 2026-10-02
- **Author:** project owner (recorded by @claude-code)
- **Related:** PROJECT_SPEC §4.3, §31, §62–63, §77

## Context

Fast full-text search, backlinks and settings need a store. External databases contradict the single-container goal.

## Decision

- SQLite at `DATA_DIR/system/app.db`, accessed via `better-sqlite3`, with FTS5 for search.
- It stores only derived or app-level data: the document index, tags, links, FTS, settings, users and sessions, and pins.
- On startup the index is reconciled incrementally with the filesystem. `POST /api/v1/index/rebuild` recreates it from scratch.
- Switching the binding (e.g. to `node:sqlite`) or the engine requires a new ADR.

## Alternatives considered

- **PostgreSQL / Elasticsearch / Meilisearch.** Rejected because each is an extra service (RULE 4).
- **In-memory only index.** Rejected because it is slow to rebuild for 10k documents and gives no place for sessions or settings.

## Consequences

- Deleting `app.db` loses only sessions, pins and settings. Documents, search and links come back after a rebuild (critical test B).
- A schema migration strategy is needed (Phase 14).

## Security recovery amendment — 2026-10-04

[ADR-0019](0019-fail-closed-authentication-recovery.md) supersedes historical database-deletion/recreation guidance. The derived document index remains rebuildable, but accounts, sessions and MFA are durable authentication data. Never delete or replace `app.db` to repair search. Corrupt/missing/reset initialized databases refuse startup; restore the matching system backup. Index rebuilds clear derived tables only.
