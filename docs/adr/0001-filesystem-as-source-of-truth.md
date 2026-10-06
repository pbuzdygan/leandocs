# ADR-0001: The filesystem is the source of truth

- **Status:** Accepted
- **Date:** 2026-10-02
- **Author:** project owner (recorded by @claude-code)
- **Related:** PROJECT_SPEC §4.1, §11, §27, §103

## Context

Existing PKM tools (Trilium, partly Poznote) keep content or structure in an application database. That causes lock-in, makes migration harder and ties the documentation's survival to the app. LeanDocs targets technical users who back up, grep, version and edit files with standard tools.

## Decision

- Every document is a file under `DATA_DIR/content/`. Folders on disk are the navigation tree.
- Every operation (create, update, rename, move, trash, restore) is performed on the filesystem first. Indexes are updated afterwards.
- The app never assumes it is the only writer. External changes (editors, `git pull`, rsync) are expected and detected.
- Writes are atomic (temp file + rename) and never silently overwrite a newer version (revision check → 409).

## Alternatives considered

- **Content in SQLite with Markdown export.** Rejected because Markdown would become an export format and app removal would mean data loss.
- **Folder hierarchy stored in the DB.** Rejected because the tree would diverge from the disk.

## Consequences

- Deleting the app, the DB or the container never loses documentation (critical tests A–D, PROJECT_SPEC §103).
- A file watcher and conflict handling are required (Phase 12).
- Path-traversal protection is security-critical and must be centralised (`apps/server/src/filesystem`).
