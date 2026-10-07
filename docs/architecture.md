# Architecture

How LeanDocs is built today. The binding requirements are in [`PROJECT_SPEC.md`](../PROJECT_SPEC.md) and the [ADRs](adr/). This file describes the current implementation. User-facing guides: [deployment](deployment.md), [configuration](configuration.md), [import](import.md), [Markdown](markdown.md), [attachments](attachments.md).

## Data layout

```text
DATA_DIR/
├── content/                 ← the documentation (source of truth)
│   ├── Infrastructure/
│   │   ├── BUZHULK.md
│   │   └── BUZHULK.assets/  ← attachments of BUZHULK.md (not a navigation folder)
│   ├── _templates/          ← system folder (hidden from the tree)
│   └── _trash/              ← system folder (hidden from the tree)
└── system/                  ← durable app state and rebuildable SQLite index; back up together
```

### Scanner rules (`apps/server/src/documents/scanner.ts`)

| Entry                                            | Treatment                                                                         |
| ------------------------------------------------ | --------------------------------------------------------------------------------- |
| `*.md` file (case-insensitive)                   | Document                                                                          |
| Other files                                      | Not indexed as documents; supported files in `.assets` are managed as attachments |
| Name starting with `.`                           | Ignored (`.git`, editor temp files, atomic-write temp files)                      |
| Folder starting with `_` **at the content root** | System folder, hidden. Nested `_folders` are normal folders.                      |
| Folder ending in `.assets`                       | Attachments of the sibling document, not a navigation folder                      |
| Symlinks                                         | Not followed (prevents escaping the content root and loops)                       |

## Server modules (`apps/server/src`)

| Module                       | Responsibility                                                                                                                                                                                                                |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `config/`                    | Environment → typed `AppConfig`                                                                                                                                                                                               |
| `filesystem/data-dir.ts`     | Creates/validates `content/` and `system/`                                                                                                                                                                                    |
| `filesystem/safe-path.ts`    | **Security-critical.** Every user-supplied path goes through it: no `..`, absolute paths, NUL, backslashes, or symlink escapes                                                                                                |
| `filesystem/file-name.ts`    | Human-readable, portable file names; reserved names rejected                                                                                                                                                                  |
| `filesystem/atomic-write.ts` | Temp file → fsync → rename. `atomicCreateFile` never overwrites.                                                                                                                                                              |
| `documents/frontmatter.ts`   | YAML front matter parse; **minimal-diff** text edits (only touched keys change; BOM, CRLF and the blank line after the front matter are preserved)                                                                            |
| `db/`                        | Opens `system/app.db` (better-sqlite3, WAL) and runs schema migrations. See _SQLite index_ below.                                                                                                                             |
| `documents/scanner.ts`       | Walks `content/`                                                                                                                                                                                                              |
| `documents/registry.ts`      | Document registry: in-memory lookups (id → path/title, tree) backed by the SQLite index. Each refresh re-reads only changed files and writes the difference to SQLite in one transaction; `rebuild()` starts from scratch.    |
| `documents/index-store.ts`   | SQLite reads/writes for the index: `documents`, tags, aliases, `documents_fts`, `index_meta`.                                                                                                                                 |
| `documents/service.ts`       | Document operations. Writes the filesystem first, then refreshes the registry.                                                                                                                                                |
| `markdown/`                  | Parsing of untrusted content (ADR-0025): `ProcessAnalyser` runs Markdown analysis for the index and HTML conversion for imports in a child process with time and memory limits; documents beyond them are read as plain text. |
| `watcher/`                   | `ContentSync` (lock-held refresh that reports only external changes) and `ContentWatcher` (chokidar, debounced). See _External changes_ below.                                                                                |
| `folders/`, `trash/`         | Folder operations; trash layout, restore and permanent delete (see _Trash layout_ below)                                                                                                                                      |
| `attachments/`               | Upload validation, storage in `<name>.assets/` and download (see _Attachments_ below)                                                                                                                                         |
| `search/`                    | Query parsing, accent folding, ranking and snippets (see _Search_ below)                                                                                                                                                      |
| `links/`                     | Outgoing links, backlinks and broken links (see _Links_ below); rewriting on move is `documents/link-updater.ts`                                                                                                              |
| `templates/`, `pins/`        | Built-in templates in `_templates/`; pins in `app.db` (see _Templates, properties and pins_ below)                                                                                                                            |
| `import/`                    | Import pipeline and importers (see _Import_ below)                                                                                                                                                                            |
| `auth/`, `security/`         | Setup, passwords, sessions, MFA, proxy and none modes, CSRF, login limits; security headers and CSP (see _Authentication foundation_ and the sections after it)                                                               |
| `text.ts`, `version.ts`      | Linear-time text helpers for untrusted input (ADR-0025); `APP_VERSION` for health and logs                                                                                                                                    |
| `api/`                       | Fastify routes. They only validate input and call services.                                                                                                                                                                   |
| `errors.ts`                  | `AppError(status, code, message)` → standard error body                                                                                                                                                                       |

## Document identity

- The stable id is front matter `id` (UUID for new documents). Ids must match `^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$` because they appear in URLs.
- **Missing id (D-10):** on discovery the server adds only the missing `id` (plus `title`, `created` and `updated` if those are missing too) as new lines at the end of the front matter. Everything else stays byte-for-byte. The write is atomic and skipped if the file changed in the meantime. `ASSIGN_MISSING_IDS=false` disables this.
- **Provisional id** `p-<sha256(path)[0..24]>` is used when a file has no usable id: assignment disabled, invalid front matter, invalid id, or duplicate id. It changes if the file moves.
- **Duplicate ids:** the first path in code-point order keeps the id. Later copies get provisional ids and a `DUPLICATE_ID` issue. Files are never rewritten to fix duplicates.
- **Title:** front matter `title`, otherwise the first `# H1`, otherwise the file name.

Scan issues (`FRONTMATTER_INVALID`, `INVALID_ID`, `DUPLICATE_ID`, `ID_ASSIGNMENT_FAILED`, `UNREADABLE`, `TOO_COMPLEX`, `NOT_UTF8`, `UNREADABLE_FOLDER`, `INVALID_FILE_NAME`) are logged as warnings, kept in the registry, returned by `GET /index/status` and listed in Settings › Index.

**Damaged content (P15-03, tests: `api/filesystem-corruption.test.ts`).** A damaged content folder never stops the server, never hides healthy documents and is never "repaired" by rewriting bytes:

- **Not UTF-8** (`NOT_UTF8`, schema v7 `documents.not_utf8`): the file is listed and searchable with its text decoded lossily (U+FFFD), but nothing writes it: no id assignment, no link rewriting, and saves, property changes and retitling answer 422 `NOT_UTF8`. Renaming and moving the file keep its bytes. `DocumentDto.notUtf8` makes the web page read-only with an explanation. Import already rejects such files.
- **Folder that cannot be listed** (`EACCES`/`EPERM`): `UNREADABLE_FOLDER`; its documents are left out and the rest of the scan continues. An unreadable content root still fails startup.
- **Names that are not UTF-8**: the scanner reads raw names; such a document or folder is reported as `INVALID_FILE_NAME` (it cannot be opened through a decoded path) instead of disappearing silently.
- **Front matter** that is invalid YAML, not a mapping, or expands too many aliases ("billion laughs", `yaml` limit) is `FRONTMATTER_INVALID`; the document stays listed and the header is never rewritten.
- Unreadable files (`UNREADABLE`), interrupted atomic-write temp files (hidden dot-files), symlinks, folders named `*.md`, damaged trash metadata (item skipped and left on disk) and a content folder that disappears temporarily are covered by the same tests.

## Mutations and safety rules

- All mutations (create, save, rename, move, trash, restore, permanent delete, folder operations) run one at a time under a single `MutationLock` (`filesystem/lock.ts`). Reads are not locked.
- **Never overwrite:** create uses `link()`-based exclusive publish; rename/move use `moveNoOverwrite` (hard link + unlink for files, existence check + rename for folders). A clash returns 409 and leaves both sides untouched.
- **Attachments follow their document:** rename/move/trash/restore always carry `<name>.assets/` along. If the assets folder cannot follow, the file move is rolled back.
- **Conflicts:** a save must send `expectedRevision`. If the file's current `sha256:` differs (another editor, `git pull`, a second tab), the save is rejected with 409 `DOCUMENT_CONFLICT` and `details.currentRevision`; nothing is written.
- Links in _other_ documents are rewritten after rename/move (see _Links_ below, `documents/link-updater.ts`).

## Trash layout (`trash/trash.ts`)

```text
content/_trash/
└── 20261002T153000Z-1a2b3c4d/          ← trashId (UTC timestamp + random)
    ├── .leandocs-trash.json            ← { version, kind, name, originalPath, deletedAt, documentId?, title?, assetsName? }
    ├── BUZHULK.md                      ← the document, unchanged
    └── BUZHULK.assets/                 ← its attachments (if any)
```

- Folders with content are trashed the same way (`kind: "folder"`). Empty folders are removed directly.
- Restore moves everything back to `originalPath` and recreates missing parent folders. If something already exists there it returns 409 `RESTORE_CONFLICT` and the item stays in the trash.
- Permanent delete (`DELETE /trash/:trashId`, `DELETE /trash`) is the **only** operation that destroys content, and only for items already in the trash.
- The metadata is a plain file that could be edited by hand, so it is validated (single-segment names, safe visible `originalPath`). Invalid entries are ignored.

## API (implemented)

Base `/api/v1`. Errors always use `{ "error": { "code", "message", "details?" } }`. Unknown request fields are rejected (`VALIDATION_ERROR`). The body limit is 10 MiB. Common errors on any path input: `UNSAFE_PATH` 400, `INVALID_FOLDER` 400 (hidden/system folder), `INVALID_NAME` 400, `FOLDER_NOT_FOUND` 404.

### Documents

| Method & path                 | Body → response                                                                                                                                              | Specific errors                                    |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| `GET /tree`                   | → `{ root: TreeFolderNode }`; folders first, natural sort. Refreshes the registry, so external edits show up.                                                | —                                                  |
| `GET /documents/:id`          | → `DocumentDto`. `content` excludes front matter and its blank separator line. `revision` = `sha256:` of the file bytes.                                     | `DOCUMENT_NOT_FOUND` 404                           |
| `POST /documents`             | `{ name, folder?, title?, content? }` → 201 `DocumentDto`                                                                                                    | `DOCUMENT_EXISTS` 409                              |
| `PUT /documents/:id`          | `{ content, expectedRevision }` → `DocumentDto`. Replaces the body, refreshes `updated`, keeps the rest of the front matter (invalid front matter verbatim). | `DOCUMENT_CONFLICT` 409                            |
| `POST /documents/:id/rename`  | `{ name, title? }` → `DocumentDto`. Renames file + `.assets`; the title changes only if given.                                                               | `DOCUMENT_EXISTS` 409, `FRONTMATTER_INVALID` 422   |
| `POST /documents/:id/move`    | `{ folder, createFolders? }` → `DocumentDto`                                                                                                                 | `DOCUMENT_EXISTS` 409                              |
| `DELETE /documents/:id`       | → `TrashItem` (moved to trash with its attachments)                                                                                                          | —                                                  |
| `POST /documents/:id/restore` | → `RestoreResponse`. Restores the most recently trashed copy of that id.                                                                                     | `TRASH_ITEM_NOT_FOUND` 404, `RESTORE_CONFLICT` 409 |

### Folders

Folder paths contain `/`, so they go in the body or query string.

| Method & path            | Body → response                        | Specific errors                                       |
| ------------------------ | -------------------------------------- | ----------------------------------------------------- |
| `POST /folders`          | `{ parent?, name }` → 201 `FolderDto`  | `FOLDER_EXISTS` 409                                   |
| `POST /folders/rename`   | `{ path, name }` → `FolderDto`         | `FOLDER_EXISTS` 409                                   |
| `POST /folders/move`     | `{ path, targetFolder }` → `FolderDto` | `INVALID_MOVE` 400 (into itself), `FOLDER_EXISTS` 409 |
| `DELETE /folders?path=…` | → `{ trashed, trashItem? }`            | —                                                     |

The documentation root (`""`) cannot be renamed, moved or deleted.

### Search and index

| Method & path                  | Query/body → response                                                                                                                                                                                                                                     | Specific errors                                                    |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `GET /search`                  | `?q=…&limit=1–50` (default 20) → `SearchResponse { query, results: SearchResult[] }`. Refreshes the registry first, so edits are visible at once.                                                                                                         | `VALIDATION_ERROR` 400 (missing `q`, `q` > 500 chars, bad `limit`) |
| `GET /index/status`            | → `IndexStatusResponse { documents, folders, tags, issues, storage { dataDir, contentDir, attachmentsBytes, databaseBytes }, rebuild { state, done, total, lastRebuildAt, error? } }`. During a rebuild it reports the last known counts without waiting. | —                                                                  |
| `GET /documents/:id/links`     | → `OutgoingLinksResponse { items: OutgoingLink[] }`: one item per distinct target (`target: null` when broken), with a count.                                                                                                                             | `DOCUMENT_NOT_FOUND` 404                                           |
| `GET /documents/:id/backlinks` | → `BacklinksResponse { items: Backlink[] }`: documents linking here (self-links excluded), with counts, by title.                                                                                                                                         | `DOCUMENT_NOT_FOUND` 404                                           |
| `GET /links/broken`            | → `BrokenLinksResponse { items: { source, kind, raw }[] }` (PROJECT_SPEC §25).                                                                                                                                                                            | —                                                                  |
| `POST /index/rebuild`          | → 202 `IndexRebuildStatus`. Starts a full rebuild in the background (§31); a second request while one runs joins it. Poll `GET /index/status` for `done / total`. Shutdown waits for a running rebuild.                                                   | —                                                                  |

### Trash

| Method & path                  | Response                                      | Specific errors                                    |
| ------------------------------ | --------------------------------------------- | -------------------------------------------------- |
| `GET /trash`                   | `{ items: TrashItem[] }`, newest first        | —                                                  |
| `POST /trash/:trashId/restore` | `RestoreResponse { kind, path, documentId? }` | `TRASH_ITEM_NOT_FOUND` 404, `RESTORE_CONFLICT` 409 |
| `DELETE /trash/:trashId`       | 204 (permanent)                               | `TRASH_ITEM_NOT_FOUND` 404                         |
| `DELETE /trash`                | `{ deleted: n }` (permanent)                  | —                                                  |

## Web app (`apps/web/src`)

| Folder           | Responsibility                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/`           | Routes (`/setup`, `/login`, `/`, `/doc/:id`, `/doc/:id/edit`, `/settings/{general,editor,security,storage,index,links,about}`, `*`), `AppShell`, `Topbar` (search field, New, Settings), `Home`, providers                                                                                                                                                                                                                                                                                                          |
| `api/`           | Typed fetch client (`client.ts`, `ApiError` with server `code`) and TanStack Query hooks (`queries.ts`). Every content mutation invalidates tree, recent, documents and search results.                                                                                                                                                                                                                                                                                                                             |
| `actions/`       | `ContentActionsProvider`: the single owner of content actions and their dialogs, used by the tree, the context menus, the document header and the topbar. `menu-entries.tsx` builds the menus (UI_SPEC §23, §129).                                                                                                                                                                                                                                                                                                  |
| `components/ui/` | Primitives wrapping Radix (ADR-0006): Button, IconButton (+tooltip), TextField/SelectField, Dialog, DropdownMenuButton, ContextMenuArea, Toast, states (skeleton, empty, error)                                                                                                                                                                                                                                                                                                                                     |
| `navigation/`    | Sidebar (resizable 220–400 px, mobile drawer), ARIA tree with roving tabindex, drag & drop, expanded state (`NavigationContext`)                                                                                                                                                                                                                                                                                                                                                                                    |
| `search/`        | `SearchProvider` owns the global Ctrl/Cmd+K (search) and Ctrl/Cmd+P (quick open) shortcuts, caught in the capture phase so they work inside the editors and replace the browser's print/address-bar shortcuts. `CommandPalette`: ARIA combobox + listbox; search mode queries `GET /search` (150 ms debounce, never cached as fresh), quick open matches titles/paths from the tree client-side (`quick-open.ts`), and an empty query shows recent documents. Snippets render as text with `<mark>`, never as HTML. |
| `settings/`      | Settings layout (mini-sidebar) with General, Editor (`PreferenceSettings`, saved on change), Security (password, authenticator app), Storage, Index, Broken links and About pages; `RebuildIndex` confirms (UI_SPEC §87), starts the background rebuild and shows progress from the polled status.                                                                                                                                                                                                                  |
| `documents/`     | Document page (header, breadcrumb, View/Source, right panel with Contents · Links · Info)                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `editor/`        | Source (CodeMirror) and Visual (Milkdown, `visual/`) editors, autosave session, drafts, conflict dialog, `[[` link picker (see _Source editing_ and _Visual editing_ below)                                                                                                                                                                                                                                                                                                                                         |
| `markdown/`      | View rendering pipeline, code blocks, Mermaid (see _Markdown pipeline_ below)                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `attachments/`   | Attachment panel, upload control and drop surface                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `auth/`          | Setup and login pages                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `styles/`        | `tokens.css` (UI_SPEC §5, §85), `base.css`, bundled fonts                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `utils/`         | Formatting (relative time, paths) and guarded `localStorage` preferences                                                                                                                                                                                                                                                                                                                                                                                                                                            |

Rules: colours only via tokens; branding only via `APP_NAME` and `AppLogo`; no UI for features that do not exist yet (D-22).

## Markdown pipeline

```text
packages/shared  parseMarkdown()   remark-parse + GFM + directives → callouts (known types only; other
                                   directive syntax restored as literal text) → [[wiki links]]
apps/web         applyRenderContext  drop duplicate title H1 · resolve wiki/relative .md links → /doc/<id>
                                     · unresolved → broken-link span
                 remark-rehype (raw HTML kept) → rehype-raw → rehype-sanitize (GitHub schema + LeanDocs
                 classes) → rehype-highlight (lowlight) → heading ids (after sanitising) → fragment fix
                 → React via hast-util-to-jsx-runtime
```

- **Security:** nothing after `rehype-sanitize` copies user-controlled markup. Raw HTML ids get the `user-content-` prefix (DOM clobbering). Heading ids are generated by our code and prefixed with `section-` if they would shadow a `window` property. The only `innerHTML` is Mermaid's SVG, produced in `securityLevel: 'strict'`. `markdown.test.tsx` holds the XSS suite; it is mutation-checked (removing the sanitiser fails 19 tests).
- **Performance:** the document route is a separate chunk (~170 kB gzip). Mermaid is loaded only when a diagram is on the page.

## Source editing (Phase 5)

`/doc/:id/edit` edits the Markdown body inside the existing document layout. Source mode uses CodeMirror 6. New documents open here in the default editor from Settings › Editor (Visual unless changed); the Visual/Source tabs switch for the current editing session only. View mode retains a read-only Source tab. The editor uses bundled language support and token-based styling; line numbers, word wrap and tab size (indent unit and tab width) come from Settings › Editor and are read when the editor mounts.

`editor/EditorSession` owns dirty tracking and serialised saves independently of React. Autosave waits for the delay from Settings › Editor (1.5 seconds by default) after changes; with autosave off (Settings › General) the session still writes local drafts and saves when the editor is left. Save, Ctrl/Cmd+S, and Done save immediately; Done returns to View only after a successful save. Ctrl/Cmd+E toggles View/Edit, Ctrl/Cmd+B/I wrap selected text in Markdown emphasis, and Escape closes search before leaving editing. CodeMirror supplies search/replace, undo/redo, bracket matching and Tab indentation.

Every save includes the current `expectedRevision`; successful saves update it and the query cache. A 409 pauses autosave and preserves editor content. The conflict dialog offers review, reload, save as copy and cancel. An explicit Keep my version is available only inside review and still uses a revision check; another disk change remains a conflict. Reload updates both the editor and the View cache.

Local drafts are written synchronously on each change under `leandocs.draft.<id>` with content, base revision and timestamp. Pending drafts advance to the new base revision after a successful save of older content. They are removed after saving all changes or undoing back to the saved content. An unaccepted recovery draft survives a clean editor unmount. Recovery always asks Restore/Discard; it never automatically replaces server content. Storage access is guarded; unavailable/full browser storage prevents local recovery, while server save errors remain visible. Leaving the editor performs a best-effort save; closing a tab with unsaved work requests the browser's unload confirmation.

Regression coverage lives in `editor-session.test.ts`, `editing.test.tsx` and `e2e/editing.spec.ts`. Browser tests verify content in real Markdown files, external-edit conflicts, formatting shortcuts and search dismissal.

## Visual editing (Phase 6)

`editor/visual/VisualEditor.tsx` lazy-loads the headless Milkdown Kit (7.22.2) with CommonMark, GFM and history. The Visual/Source tabs select two views of the same `EditorSession.content`; both share autosave, explicit Save/Done, revisions, conflict handling and local recovery. A document transaction immediately emits Markdown, so switching to Source before the autosave debounce preserves the current text. Mounting Visual does not emit changes or normalise files. The starting mode is the `editor.defaultMode` setting.

The toolbar provides paragraph/headings, bold/italic/strikethrough/inline code, lists, checklists, quotes, links, existing image URLs, tables, code blocks, callouts and dividers. Selection shows a smaller formatting toolbar. Typing `/` at the beginning of an empty paragraph opens a keyboard-accessible insert menu (arrows, Enter, Escape). Native checkboxes toggle task state. Image/attachment uploads, clipboard paste and file drop are implemented in Phase 7; their insertion anchors map through concurrent edits.

`create-editor.ts` runs directive parsing and the preservation transform before Milkdown's normalising transforms. Blocks with raw HTML, wiki links, directives, references and other unsupported syntax become opaque selectable blocks containing text, with Source as their editing mode. Inline unsupported syntax protects its entire enclosing block. Callouts inserted by the toolbar are preserved blocks; edit their text in Source. Mermaid remains an editable fenced code block in Visual and is rendered only in View.

Unchanged top-level nodes keep their original Markdown; changed nodes are serialized through Milkdown, with blank lines between blocks. This can normalise inter-block whitespace after an actual visual edit. Server front matter is outside the editor body and remains preserved by the existing minimal-diff writer. Link and image DOM attributes filter unsafe URL protocols, and opaque HTML is never executed. View rendering retains the existing sanitisation pipeline.

See ADR-0007 for the preservation decision. `visual/roundtrip.test.ts` uses actual Milkdown editors to test Source → Visual → edit → Source across formatting, tables, tasks, code, Mermaid, callouts, unknown directives, wiki links, HTML and reference definitions. `e2e/visual-editing.spec.ts` covers immediate mode switching, toolbar/slash actions, autosave, native checkboxes, links/images/tables, disk content and unknown front-matter preservation.

- **Owner feedback 2026-10-02 (P6-06…P6-12, P4-12):** `editor/visual/blocks.ts` adds the editable `callout` node (ADR-0007 amendment), code block rendering with a language label and lowlight highlighting as decorations (same languages and `hljs-*` classes as View; text untouched), the code block exit keymap (Enter on an empty last line, ArrowDown at the end) registered before the presets so it wins over the defaults, and `blockContext()` for the contextual toolbar row (table row/column tools via Milkdown table commands and `prosemirror-tables` delete commands; code language and callout type set with `setNodeAttribute`). Floating menus are `position: fixed` at `view.coordsAtPos(selection.from)` and follow scrolling. In edit mode the document controls live in the sticky `.doc-editbar`; the formatting toolbar sticks below it (`--editbar-height`). Width: `.doc--wide` (default, `leandocs.layout.wide`) removes the 900 px cap.

## Attachments

AttachmentService runs uploads and deletions under the shared mutation lock and uses exclusive atomic file creation, safe asset-directory resolution and validated no-follow file reads. Listing and downloading are not locked (KI-8, P15-07): they wait for a running mutation, then read without blocking later ones. Text attachments are validated on their bytes; only JSON and SVG are decoded. Multipart requests are bounded and fully consumed before publishing files. Canonical Markdown keeps relative asset paths; rendering resolves them to document-ID API URLs. See [ADR-0008](adr/0008-attachment-upload-and-serving.md) and [attachments](attachments.md).

## SQLite index (Phase 8)

`DATA_DIR/system/app.db` holds **derived** data (ADR-0003) and application metadata. Authentication, settings and pins are durable application data; document content stays on disk and its derived index can be rebuilt. Do not delete the database to repair search.

- **Open (`db/database.ts`):** `journal_mode = WAL`, `synchronous = NORMAL`, `foreign_keys = ON`, `busy_timeout = 5000`. The connection is closed in Fastify's `onClose` hook.
- **Recovery (ADR-0019, superseding D-33):** validate the SQLite header and integrity before migration. Unreadable, corrupt, empty or symlinked databases stop startup without replacement. A private `system/auth.initialized` marker is flushed before first account creation and adopted for legacy accounts. Missing/reset databases with evidence of prior initialization refuse startup/setup in every auth mode. Restore a consistent matching database, marker and MFA key; never automatically discard authentication.
- **Migrations (`db/migrations.ts`):** an ordered list; the applied version is `PRAGMA user_version`. Each migration and its version bump run in one transaction. A database with a **newer** schema than the code is refused at startup (`SchemaVersionError`) instead of being replaced. Never edit a released migration; append a new one. Policy, rules and the upgrade tests: [migrations.md](migrations.md).
- **Schema v1:** `documents` (§63 columns plus an explicit `key` INTEGER PRIMARY KEY, `id_source`, `size`, raw `frontmatter_id` and `frontmatter_error`), `tags` + `document_tags`, `document_aliases`, `documents_fts` (FTS5, `rowid` = `documents.key`: title, aliases, tags, headings, filename = file name without `.md`, path = folder, body = plain text from `extractPlainText`; `unicode61 remove_diacritics 2`, prefix indexes 2 and 3), `index_meta`, `settings`. Links come with Phase 9, users/sessions with Phase 11, each as a new migration.
- **Indexing (P8-02):** `DocumentRegistry` keeps serving lookups from memory and mirrors every change into SQLite. On startup it seeds its cache from the stored rows (path, mtime, size, raw front matter id, title), so only files whose mtime/size changed while the server was stopped are re-read; there is no full rebuild on restart (§62). Each refresh deletes the rows of removed or changed paths and inserts the new ones (document, tags, aliases, FTS row) in **one transaction**, then drops orphaned tags. A row whose content is unchanged but whose resolved id changed (a duplicate disappeared) is re-read and re-keyed. `content_hash` is the same `sha256:` value as the document revision.
- **Analysis limits (ADR-0025, schema v6):** bodies are analysed through the registry's `MarkdownAnalyser` (the server passes `ProcessAnalyser`). A body larger than 2 MiB, slower than 20 s or needing more than 512 MiB is indexed with its raw text and no links/headings; `documents.analysis_limited` stores why, the `TOO_COMPLEX` issue reports it, and `DocumentDto.analysisLimited` tells the web app to show plain text and edit in Source mode only. Link rewriting on move skips such documents; import checks every document before rewriting its links.
- **Schema v7 (P15-03):** `documents.not_utf8` remembers files that are not UTF-8, so the `NOT_UTF8` issue survives a restart without re-reading unchanged files.
- **Schema v8 (P15-04):** sets every stored `mtime_ms` to -1 so the first start after the update re-reads all documents once; rows written before v7 never had their encoding checked.
- **Rebuild (§31):** `registry.rebuild()` clears every derived table (not `settings`), forgets the cache, re-indexes all files and records `index_meta.lastRebuildAt`. Authentication, sessions, MFA, settings and pins remain intact. Database deletion is not an index-repair procedure.
- **Cost:** measured with 10,000 generated documents in P15-07 ([performance.md](performance.md)): first index ≈ 41 s (Markdown analysis, ~4 ms per document), restart ≈ 3 s, a full reconciliation ≈ 120 ms (the scanner stats up to 32 files of a folder at a time). Duplicate-id resolution still traverses cached metadata.

## External changes (Phase 12, `watcher/`)

See [ADR-0020](adr/0020-content-watcher.md).

- **Change sets:** `DocumentRegistry.refresh()` returns `ContentChanges`: documents `added`/`changed`/`removed` by id (`previousPath` when a document kept its id but moved) and folders `added`/`removed`, sorted by path.
- **`ContentSync`:** the only way to refresh outside a mutation. It takes the `MutationLock`, so the app's own writes are already indexed and every difference it finds is external; those are logged (`External content change`) and passed to listeners. Called inside a mutation (`MutationLock.held()`), it refreshes without reporting. `ensureFresh()` waits for mutations without scanning while watching is healthy; disabled or failed watching restores full scans on reads. `DocumentService.readEntry`'s lookup retry still requests a full refresh.
- **`ContentWatcher`:** chokidar on `DATA_DIR/content`, started last in `buildApp` (§62) and closed before the database. It follows the scanner's visibility rules (no dot-entries, root `_` folders, `*.assets` or non-`.md` files; no symlinks). Events only trigger a `ContentSync` refresh after 250 ms of quiet (at most 2 s during a stream). After the initial walk it refreshes once to catch changes made during startup. `WATCH_MODE=poll` polls every second; `off` disables it. Watcher errors are logged and leave per-request scans in charge.
- **Incremental reconciliation:** event paths are validated and inspected on disk. A file event reads only that file; directory events scan the affected subtree. Missing or unsafe ancestors invalidate that cached subtree. Metadata for other paths remains cached. Global duplicate-id resolution stays deterministic, and all affected SQLite tables update transactionally. Explicit file events ignore the mtime/size shortcut and compare content hashes, detecting edits that preserve both. Event-refresh failures disable the healthy-watcher read shortcut. While watching is healthy, saving and creating a document re-read only that file (`ContentSync.refreshWritten`, P15-07); the watcher reports everything else as external changes. Startup, rebuilds, other mutations, and saves without healthy watching retain full reconciliation.
- **Read consistency:** externally edited tree/search/tag/link views update after the watcher debounce (plus the polling interval in polling mode). Known documents and save revision checks still read actual bytes. API fixtures that require immediate discovery after direct filesystem writes explicitly use `WATCH_MODE=off`; watcher integration tests wait for event-driven indexing. Index status skips registry reconciliation while healthy, but storage usage accounting still visits attachment folders.

External invalidations are available at `GET /api/v1/events` (SSE), documented in
[ADR-0021](adr/0021-external-change-events.md). Every connection emits `ready` with `{ "resync": true }`;
clients refetch after connecting/reconnecting. Nonempty external batches emit `content-changed` with
the shared `ContentChanges` contract. There are no event ids or replay. Heartbeats run every 15 seconds;
local-session access is rechecked before each write. Five-minute connection lifetimes renew gateway
authentication, and disconnect/shutdown releases timers and streams. Limits are 32 connections and
64 KiB queued per stream; a disconnected client resyncs. The authenticated app shell owns one
EventSource and invalidates affected TanStack Query data, with a full content resync on `ready`.
Viewed documents refresh with a notification. Editing sessions pause autosave immediately and
retain their text/drafts in the conflict flow, including external deletion. Explicit reload or
revision-checked overwrite resolves the conflict; missing documents can be recovered as copies.

## Search (Phase 8, `search/`)

- **Query (`search/query.ts`, PROJECT_SPEC §33):** free words, `"quoted phrases"` and the filters `tag:`, `path:`, `title:` (values may be quoted). Any other `key:value` (e.g. `host:8080`) is searched as text. User text reaches FTS5 `MATCH` **only as double-quoted strings** (quotes doubled), so FTS syntax such as `NEAR`, `OR`, `-`, `*`, `^` or column filters cannot be injected; words get a trailing `*` (prefix match, type-ahead), phrases do not. All terms are ANDed. Terms without a letter or digit are dropped.
- **Filters:** `tag:` matches a tag exactly (ASCII case-insensitive, `#` optional). `path:` matches from the start of any folder segment (`path:network` finds `Infrastructure/Network/…`). `title:` is searched as a word and additionally requires every value to start a word of the title. Filter-only queries list the matching documents by title.
- **Ranking (§32):** up to 500 candidates are fetched by `bm25()` with column weights title 10, aliases 6, tags 5, headings 4, file name 3, folder 2, body 1. Each result is then put in a tier, and tiers come first: exact title → title prefix → every word starts a title word (`title-words`) → alias → tag → heading → body (`content`). Within a tier the bm25 order is kept. Comparisons use `normalizeForMatch` (case, accents and the letters below folded).
- **Folding (KI-6, resolved):** `unicode61 remove_diacritics 2` folds ą ę ó ś ź ż ć ń but keeps ł, đ, ø, ħ as separate letters. The FTS column `folded` repeats every word containing one of them in folded form, and queries are folded the same way, so `zrodlo`, `źródło` and `ZRÓDŁO` all find "Źródło". The original text is left alone, so snippets show the real spelling (a match that came only through `folded` is not highlighted).
- **Snippets (`search/snippet.ts`, ADR-0025):** built in linear time for the returned results only, from the first 200,000 characters of the body: up to 16 words around the first match, every matched word (prefix) or phrase marked, `…` where text was cut. FTS5's `snippet()`/`highlight()` are not used: they are quadratic in the number of matches in one document. Returned as `SnippetPart[] { text, match }`, plain text and never HTML; the frontend renders matches with `<mark>`.

## Links (Phase 9)

- **Extraction (`@leandocs/shared` `links.ts`):** `extractLinks` returns wiki links (`[[Target#Heading|Label]]`) and relative Markdown links/definitions to `.md` files; images, external URLs, absolute paths and in-page anchors are not document links. Code is never scanned.
- **Resolution (`createLinkResolver`, shared by server and View):** wiki targets match title → alias → file name → path (with or without `.md`), case-insensitive; within one kind the first document in path order wins. Markdown links resolve relative to the source folder. Aliases come from front matter `aliases` and are part of `TreeDocumentNode`.
- **Storage (migration 2):** table `links` (`source_key`, `ordinal`, `kind`, `target` as written, `lookup`, `heading`, `alias`) is written in the same transaction as its document. Links are stored **unresolved**: `lookup` is the normalised wiki target or the normalised path a Markdown link points to. Backlinks query candidate rows by the target's possible keys (`wikiKeys` + path) and confirm each with the resolver, so creating or renaming a document never requires rewriting other rows. Migration 2 empties the derived tables, which makes the next start re-index every file.
- **Service (`links/service.ts`):** outgoing (grouped by target), backlinks (grouped by source) and broken links, resolved against the current registry.
- **Keeping links working (`documents/link-updater.ts`, §26):** moves are path mappings (document, its `.assets/` folder, or a folder prefix). Before the move, the updater collects the sources from the index (rows whose `lookup` is a moved path, stem or prefix) plus the moved documents. After the move it rewrites only destination text: relative links/images/definitions are re-pointed or rebased (encoding style, `./` prefix, `<…>` and `#fragments` kept; already-broken links untouched), and wiki links are rewritten only when they would stop reaching the same document (file-name or path style, or the old title after a retitle), preferring the new title. Front matter, prose, code and raw HTML are untouched. Used by document rename/move and folder rename/move; a document that cannot be updated is logged and keeps its old links (the move itself stands).
- **Editors (P9-06):** `[[` opens a document picker (`editor/link-picker.ts`: fuzzy title/path plus alias prefixes; the edited document itself is not offered). Visual shows wiki links as an inline `wiki_link` node, serialised verbatim as `[[…]]` through a raw inline node (no bracket escaping), styled broken when unresolved; typing a closed `[[…]]` converts it. Source uses CodeMirror autocompletion and reuses an auto-closed `]]`. No-break spaces that browsers type next to inline atoms are written as plain spaces when a block is serialised.

## Templates, properties and pins (Phase 10)

- **Templates (`templates/`):** `_templates/` (a root system folder, hidden from tree and index) is seeded with Server, Application, Procedure, Network Device and Incident **only when the folder does not exist**, so edited or deleted templates are never restored. `POST /documents` accepts `template` (not combined with `content`): the template's front matter keys except `id`/`title`/`created`/`updated` are copied after the generated ones (e.g. `tags`), and `{{title}}` / `{{date}}` (UTC `YYYY-MM-DD`) are filled in the body and string values. A template with invalid front matter is used as plain text.
- **Properties (`DocumentService.updateProperties`):** front matter edits use `setFrontmatterFields` (a value of `undefined` now removes a key). Tags drop a leading `#`; tags and aliases are trimmed and de-duplicated case-insensitively. The web Info tab is read-only while the document is open in the editor, so it cannot conflict with the editor's revision.
- **Settings (`settings/service.ts`, P16-01):** one `settings` row per field (`general.autosave`, `editor.tabSize`, …) holding JSON; `GET /settings` merges them over `DEFAULT_SETTINGS` from `packages/shared` and reads unknown keys or invalid stored values as defaults, `PATCH /settings` takes any subset, validates it completely (schema enums; `newDocumentFolder` must be an existing visible folder) and writes it in one transaction. Global, because 1.0 is single-user. Not derived: rebuilds keep them. The web app applies changes optimistically and refetches once the last pending save settles. "Open last document on startup" uses the last document viewed **in this browser** (`leandocs.lastDocument`) and only acts when the app starts on `/`.
- **Pins (`pins/service.ts`, migration 3):** `pins(document_id, pinned_at)` in `app.db`, not derived: rebuilds keep them. Pins of missing documents are kept but not listed, so a restored document is pinned again; a provisional id (D-13) changes when its file moves, which drops that pin.
- **Web:** template select in the New document dialog; Info tab (Contents · Links · Info) with `TagInput` chips and tag autocomplete (`<datalist>` from `GET /tags`); header tags open the search palette with `tag:…`; Pin/Unpin in document menus; Pinned section above the tree and on Home; Home quick action Search.

## Import (Phase 13, `import/`)

- **Pipeline (ADR-0022):** `Importer` (`import/importer.ts`) implements `reads` / `detect` / `scan` / `convert` for one source format; `ImportService` (`import/service.ts`) implements the shared `preview` and `import`. Importers are registered by `ImporterKind` (`packages/shared/src/imports.ts`).
- **API:** `POST /api/v1/import?importer=markdown-directory&destination=<folder>&dryRun=true|false`, multipart with one `files` part per selected file (file name = path in the selection). It returns an `ImportReport` with one item per document or skipped entry (`ready`/`imported`/`skipped`/`failed`, `destination`, `documentId`, `reason`, `notes`, `warnings`) and a summary.
- **Markdown directory (`import/markdown-directory.ts`):** keeps folder paths and file bytes. It skips hidden entries, `.assets` folders, non-Markdown files, invalid UTF-8 and files over 10 MiB.
- **Web (`actions/dialogs/ImportDialog.tsx`):** opened from Home (Quick actions › Import) and the empty application state. The user chooses Markdown directory (`webkitdirectory`, paths from `webkitRelativePath`) or Markdown files (flat names) and an "Import into" folder; selecting files immediately sends a `dryRun` preview. Files inside hidden folders are left out in the browser and counted. Non-Markdown files are sent as empty parts, so they are listed without uploading their bytes. Import re-sends the same selection; a single imported document opens, otherwise the tree reveals the first one.
- **HTML (`import/html.ts`, ADR-0023):** `.html`/`.htm` files become `.md` files in the same folder. The HTML is parsed with `hast-util-from-html` (no DOM, nothing executes) and walked before conversion: `<head>` is dropped and `<title>` becomes the front matter title; unsafe or unrepresentable content is removed. Each kind of loss is one item warning. Relative `.html` links point to the converted `.md` files. Encoding: BOM → `<meta charset>` → UTF-8 → Windows-1252 (warned). Converted items have `converted: true` and show "Converted" in the preview.
- **Attachments (P13-06, `import/references.ts`):** `localReferences` finds relative link/image/definition destinations in each planned document. Selection files that are not documents are copied to `<doc>.assets/` (copy per document, `-n` suffix on clashes), and `rewriteRelativeLinks` re-points only those destinations. The same moves let links between imported documents follow renamed documents. Validation is the upload rule set (`attachmentName`, `validateAttachment`, `MAX_UPLOAD_SIZE`); failures keep the link and add a warning. The preview receives non-document files as name-only parts; the dialog then sends the content of the files the preview attached (`include`). Report items for copies carry `attachmentOf`; the summary counts `attachments`.
- **Obsidian (P13-04):** `wikiFileReferences` lists `![[…]]` embeds and `[[file.ext]]` links outside code/HTML (`literalRanges`), and `findByName` resolves them by vault path or file name (closest to the note; ambiguity warned). `ImportService.attach` replaces each one with standard Markdown pointing at the copy, before the relative-link rewrite. `![[Note]]` becomes `[[Note]]`. Without such syntax the body is untouched.
- **Shared rules:** sanitised names, ` (n)` suffixes instead of overwriting, missing ids added (D-10 fields), duplicate ids replaced, invalid front matter kept unchanged. The import plans again under the `MutationLock`, uses `atomicCreateFile` and refreshes the index once.

## Authentication foundation

Schema migration 4 adds `users` and `sessions` (P11-01, [ADR-0009](adr/0009-local-authentication-storage.md)).
`users` permits one administrator (`id = 1`), with an ASCII case-insensitive username,
a salted password hash and a creation date. `sessions` stores only lowercase SHA-256 token
digests, links each session to the administrator with cascading deletion, and records integer
Unix-second creation/expiry times. User and expiry indexes support revocation and cleanup.
Both tables survive document-index rebuilds.

`auth/password.ts` hashes exact UTF-8 passwords asynchronously using Node's built-in Argon2id
(`m=65536 KiB`, `t=3`, `p=1`), random 16-byte salts and 32-byte keys. Hashes have an explicit
version and fixed parameters; malformed/unsupported encodings fail closed. Verification uses
constant-time key comparison. Empty inputs and inputs over 1024 UTF-8 bytes are rejected
without hashing; minimum password policy belongs to setup. Argon2id hashing takes roughly 64 MiB per
operation and uses the worker pool. Legacy scrypt hashes remain verifiable and upgrade on successful login. See ADR-0011 for format and resource considerations.

First-run setup (P11-02) exposes `GET /auth/setup` and `POST /auth/setup` under `/api/v1`.
`auth/setup.ts` checks the singleton account, issues a process-local setup token, validates
credentials and bounds creation to one in-flight hash. It inserts without replacing an existing
account, including when another server instance wins the race. Responses are never cached.
The token must be supplied in a custom header; cross-site Fetch Metadata requests and non-JSON
submissions are rejected. See [ADR-0010](adr/0010-first-run-setup.md) for policy and protocol.

`auth/Setup.tsx` checks setup before mounting the app shell and implements the `/setup`
account → documentation storage → Ready flow. The shared policy accepts 1–64 ASCII username
characters and passwords of at least 15 Unicode code points, up to 1024 UTF-8 bytes, with exact
confirmation. Passwords stay in component memory and are cleared after success.

Local login (P11-03) uses `auth/session.ts` and `api/auth.ts` for `/auth/login`, `/auth/logout`
and `/auth/session`. Session tokens are 32 random bytes; only SHA-256 digests are stored.
Cookies are host-only, HttpOnly, SameSite=Strict and expire after eight hours; HTTPS or
`SESSION_COOKIE_SECURE=true` adds Secure. Expiry is enforced server-side on every request,
login rotates the current session and logout revokes it. Sessions survive restart.

The global API guard checks canonical registered routes and denies anonymous access by default,
including attachments and HEAD requests. Health, setup, login and session status are public.
All API responses are no-store. Login verifies the same account hash for every username and
conditionally upgrades successful legacy scrypt logins. Hashing concurrency is bounded and
rolling direct-peer and singleton-account login limits are in place (P11-08).
Login/logout and all content mutations use custom-header CSRF tokens (P11-06).

The `/login` page and authenticated route guard own session UI state. Search and content actions
mount only in the authenticated shell. Logout and API 401 responses clear cached documents.
Ready now leads to login. See [ADR-0012](adr/0012-local-sessions-and-route-protection.md).

### Optional local TOTP MFA

P11-11 adds Settings › Security enrollment and two-stage sign-in, using OTPAuth and locally generated
QR images. Migration 5 appends `user_mfa` (encrypted secret, last accepted time step) and
`mfa_recovery_codes` (SHA-256 digests) to durable auth app data; index rebuilds retain both tables.
AES-256-GCM uses a separate private, no-follow `system/mfa.key`; restore it with the matching auth
database. Startup refuses missing/invalid keys or undecipherable active configuration.

TOTP uses six digits, SHA1, 30 seconds and a ±1-step clock window. Activation, verification and
recovery-code consumption are transactional with session rotation/issuance. Previously accepted
steps and consumed recovery codes cannot be reused, including after restart. Enrollment requires
password reauthentication and code confirmation, is session-bound and can be canceled. Activation
returns ten 128-bit recovery codes once, revokes all sessions and issues a fresh current session.
Disablement requires the password plus an unused factor and also rotates/revokes sessions.

A verified password produces only a random five-minute MFA challenge, without an authenticated
cookie. Store digests in memory (maximum ten), with five attempts, CSRF/account/password/config
bindings; restart or MFA changes discard pending state. Factors and enrollment confirmation share
the password limiter. Authenticated enrollment/disablement retain default route protection; only
`POST /auth/mfa/verify` joins the public routes and still requires CSRF. Legacy password rehashing
occurs after password verification, before any MFA challenge; it cannot grant access.

UI secrets and recovery codes remain in component memory, never query caches/storage/URLs.
Invalid factor/password responses keep the existing session; actual `UNAUTHORIZED` errors clear
cached content. Proxy/none modes deny all local MFA routes. The 15-character password policy is
unchanged. See [ADR-0018](adr/0018-local-totp-mfa.md).

## Trusted proxy authentication

P11-04 adds optional `AUTH_MODE=proxy`, not another proxy server. The owner supplies their own
external reverse proxy/authentication gateway. Ordinary Nginx Proxy Manager HTTPS/routing keeps
`AUTH_MODE=local` with `SESSION_COOKIE_SECURE=true`. Proxy authentication requires a verified
gateway identity, an explicit list of exact peer IPs, a dedicated identity header and one allowed
user (`PROXY_TRUSTED_IPS`, `PROXY_AUTH_HEADER`, `PROXY_AUTH_USER`).

`auth/proxy.ts` checks the direct socket peer through Node `BlockList` and exactly one identity
header matching the configured user. Forwarded chains/scheme headers and local cookies are
ignored. Each protected API request repeats this check; no local session/account is created.
Local setup/login/logout POSTs are disabled before parsing. GET setup reports complete; GET
session reports proxy mode and an authorized user or null. Existing local credentials remain
untouched. The UI skips local setup/login and explains gateway access; gateway sign-out/MFA
remain external. General CSRF protection also covers this mode. See [ADR-0013](adr/0013-trusted-proxy-authentication.md).

## Deliberate unauthenticated mode

P11-05 adds explicit `AUTH_MODE=none`. The default remains local and malformed mode values
fail startup. None mode bypasses only API authentication; normal validation, filesystem safety,
upload restrictions and rendering protections remain in force. Anyone with network access can
read, edit and delete documentation. Session status reports `none`, a null user and a process-local
CSRF token for content mutations; it creates no account/session/cookie and ignores supplied identity headers.

Setup is unnecessary, local setup/login/logout POSTs are disabled, and existing local credentials
are preserved for a return to local mode. Browser gates admit explicit none mode, login redirects
to documentation, setup explains the mode, and the account menu is absent. Every Settings section
shows an accessible persistent warning; startup also logs a warning. No UI toggle or automatic
fallback is provided. See [ADR-0014](adr/0014-deliberate-unauthenticated-mode.md).

## General CSRF protection

P11-06 centralizes mutation checks in the API onRequest hook, after authentication and before
JSON or multipart parsing. All unsafe methods require one constant-time checked
`X-LeanDocs-CSRF` token. Setup retains its dedicated setup nonce. Local session tokens bind the
CSRF value to the session; anonymous local, proxy and none status use process-local random
values. Unauthorized proxy status never exposes a usable token. Cross-origin Fetch Metadata,
Origin and Referer are rejected; body/query tokens and duplicate headers are not accepted.
GET/HEAD/OPTIONS remain read-only and do not need a token.

Optional `PUBLIC_ORIGIN` pins the canonical API Host as well as the expected mutation origin,
preventing alternate hosts from retrieving a nonce. Health is exempt for container probes.
Without it the scheme comes from the connection or explicit `SESSION_COOKIE_SECURE=true`,
and the Host must be preserved by the proxy; forwarded headers are ignored. No CORS is enabled.
The shared browser API client fetches fresh status before every content mutation and leaves
multipart Content-Type generation to the browser. It does not replay failed writes. See
[ADR-0015](adr/0015-general-csrf-protection.md).

## Security headers and CSP

P11-07 uses `security/headers.ts` in a global onSend hook, before route registration. HTML, static
files, API successes/errors, HEAD and SPA fallback receive browser protections. Bundled same-origin
scripts are permitted; inline scripts, event handlers and eval are not. Inline CSS is retained for
Mermaid and UI/editor styling. Connections/manifest stay same-origin; bundled fonts also allow data URLs; authored local/data/HTTP(S)
images remain compatible. Frames, framing, objects, workers and base elements are denied, and forms
stay same-origin. Existing attachment sandbox CSP takes precedence; rendering sanitizers remain intact.

Headers also disable MIME sniffing, referrers, cross-origin resource embedding, camera, microphone
and geolocation. HSTS is one year only with an actual TLS connection or explicit secure-cookie flag,
without subdomain/preload effects or trust in forwarded headers. NPM passes the headers through and
handles HTTP-to-HTTPS redirection. See [ADR-0016](adr/0016-security-headers-and-csp.md).

## Local login throttling

P11-08 replaces the preliminary fixed window with `auth/rate-limit.ts`: a monotonic rolling
60-second window, five admissions per canonical socket IP and ten for the singleton account across
all IPs/usernames. Only admitted attempts allocate state, bounding the peer map and total timestamps
to ten active entries. Rejections do not extend expiry or evict active penalties. Reserve before
credential work; retain one in-flight hash and no queue. Busy attempts consume the reservation.

The route takes the immediate socket address, ignores forwarded identities/IPs, and emits a matching
remaining Retry-After/message/details for rate limits (1–60 seconds) or busy work (one second).
Generic credential errors, no-store, CSRF/security checks and existing sessions remain intact. NPM
local sign-ins share the direct gateway IP; authenticating proxy gateways own their own limits/MFA.
Second-factor/recovery/confirmation attempts share these limits and add bounded five-minute
challenges (P11-11); see [ADR-0017](adr/0017-login-rate-limiting.md) and [ADR-0018](adr/0018-local-totp-mfa.md).

## Security review (Phase 11)

See [the recorded review](security-review.md) and [ADR-0019](adr/0019-fail-closed-authentication-recovery.md). Template reads validate their root and use no-follow file opens. Trash operations validate the trash root, item metadata, payload and destination ancestors before restoring; a missing destination cannot create folders through an external symlink. Cached document reads validate their parent and open without following file symlinks. Static unsafe paths and replaced file links fail closed; concurrent hostile writes by a host operator are outside the application trust boundary.
