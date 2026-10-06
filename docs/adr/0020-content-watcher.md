# ADR-0020: Content watcher and external-change attribution

- **Status:** Accepted
- **Date:** 2026-10-04
- **Author:** @claude-code
- **Related:** PROJECT_SPEC §27, §28, §62, §57 (`watcher/`); P12-01…P12-05; ADR-0001, ADR-0003; KI-9

## Context

Users change documents outside LeanDocs (VS Code, `git pull`, rsync, scripts). PROJECT_SPEC §27
requires `file change → watcher → parse → update index → notify frontend`, and §62 starts the
watcher after the index is reconciled. Until now the registry re-scanned the content tree on every
read request (KI-9), which picked up external edits only when someone asked and could not tell the
frontend that a document it shows changed.

The watcher must not report the app's own writes as external changes: an editor that just saved
would otherwise be told its own document changed. File events alone cannot say who wrote a file,
and the app writes through temp files, renames, moves and link rewrites across many files.

## Decision

- Use **chokidar 5.0.0** (pinned; ESM, Node ≥ 20.19, one dependency) as named in the PROJECT_SPEC
  technology table. Watch `DATA_DIR/content` with `ignoreInitial`, no symlink following and the
  same visibility rules as the scanner: dot-entries (including atomic-write temp files), root `_`
  system folders and `*.assets` folders are ignored; only `*.md` file events count.
- **Events are only a trigger.** They collapse after a 250 ms quiet period (at most 2 s during a
  steady stream) into one registry refresh. The filesystem stays the source of truth; event
  payloads are never trusted for content.
- **Attribution through the mutation lock.** Every content mutation already holds `MutationLock`
  and refreshes the registry before releasing it. `ContentSync.refresh()` runs outside mutations
  under the same lock, so the app's own writes are always indexed before it looks; any difference
  it finds is external and is reported to listeners. Inside a mutation (`MutationLock.held()`,
  via `AsyncLocalStorage`) it is the mutation's own refresh and reports nothing.
- `DocumentRegistry.refresh()` returns `ContentChanges` (documents added/changed/removed by id,
  with `previousPath` for moves; folders added/removed). These feed SSE in P12-03.
- Read routes keep their per-request refresh for now, but through `ContentSync`, so a change they
  discover is reported rather than silently absorbed. P12-02 replaces per-request scans with
  watcher-driven incremental refreshes while the watcher is healthy (KI-9).
- `WATCH_MODE=native|poll|off` (default `native`). `poll` is for network shares and mounts without
  file events; `off` relies on per-request scans only. A watcher error is logged and never stops
  the app; reads keep re-scanning, so correctness never depends on events.

## Alternatives considered

- **Journal of expected writes** (record path + fingerprint before each app write and drop matching
  events): needs hooks in every write path (atomic writes, moves, trash, link updater, id
  assignment) and still races with editors writing the same file. Rejected for fragility.
- **Suppress events for a time window after each app write:** loses genuine external edits made
  during the window and is timing-dependent. Rejected.
- **Node `fs.watch({ recursive: true })` directly:** platform differences (Linux recursion, rename
  events, polling fallback) are what chokidar exists to absorb. Rejected.

## Consequences

- External changes are detected within about a quarter of a second without any request.
- Reads that refresh now wait for a running mutation to finish (they already waited for its
  registry refresh). Mutations are short; uploads are validated before taking the lock.
- An external edit to another file made during an app mutation is absorbed by that mutation's
  refresh and not reported. Data stays safe: saves are still revision-checked (§28), and the
  frontend will compare revisions (P12-04).
- Each flush still walks the tree until P12-02 makes refreshes path-targeted.
