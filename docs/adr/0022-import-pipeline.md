# ADR-0022: Import pipeline and generic Markdown directory importer

- **Status:** Accepted (duplicate-id replacement and the stateless transport confirmed by the owner, 2026-10-07)
- **Date:** 2026-10-07
- **Author:** @claude-code
- **Related:** PROJECT_SPEC §9, §10, §66–71, §100 Phase 13; UI_SPEC §134–135; P13-01; D-10, D-12, D-13

## Context

Phase 13 must let users bring an existing Markdown library into LeanDocs without copying
documents by hand. PROJECT_SPEC §66 asks for an importer interface (`detect`, `scan`, `preview`,
`convert`, `import`) so that HTML, Obsidian and Poznote importers can follow. §67 requires the
generic Markdown importer to preserve folders and `.md` files, detect front matter, add missing
UUIDs and never destroy information. UI_SPEC §134–135 selects files in the browser and shows a
preview with warnings before anything is written. Everything runs in the single container.

## Decision

- **Transport:** `POST /api/v1/import` takes a multipart upload. Each part is named `files`, and
  its file name is the path inside the selection (`Notes/Network/Router.md`, from
  `webkitRelativePath`). Query parameters: `importer` (default `markdown-directory`),
  `destination` (a content folder, created if missing) and `dryRun`. With `dryRun=true` the
  response is the preview and nothing is written. Without it, the same request imports. The
  server keeps no staged state: the browser still holds the files and sends them again.
- **Interface split:** `Importer` implementations provide `reads`, `detect`, `scan` and
  `convert` (format-specific). `ImportService` provides `preview` and `import` for all
  importers, because every importer ends with Markdown documents that are placed, identified and
  written the same way.
- **Placement:** source folder and file names go through the normal name sanitiser. A change is
  reported as a warning. Folders merge with existing folders. Documents are never overwritten: a
  taken name (or a taken `.assets` folder) gets ` (2)`, ` (3)`… with a warning. A root-level
  `_folder` (reserved for system folders, D-12) is skipped unless a destination folder is chosen.
- **Identity:** a missing `id` is added together with any missing `title`/`created`/`updated`,
  as in D-10. This also happens when `ASSIGN_MISSING_IDS=false`, because imported files are new
  copies. An `id` already used in the library, or by an earlier file of the same selection (in
  code-point order, as in D-13), is replaced with a new UUID and a warning. Invalid front matter
  and unusable ids are kept unchanged with a warning; the index then gives the document a
  provisional id. All other bytes, including BOM, line endings, comments and key order, stay
  unchanged.
- **Skips:** hidden files and folders (`.git/`, `.obsidian/`), files that are not UTF-8, Markdown
  files over 10 MiB and files no imported document uses are listed as skipped. Each hidden folder
  gets one line.
- **Attachments (P13-06, amendment 2026-10-07):** relative links, images and reference definitions
  in an imported document are resolved inside the selection. Every non-document file found this
  way is copied into the document's new `<name>.assets/` folder. A file used by several documents
  is copied for each of them, so each document stays self-contained, as with normal uploads. Name
  clashes get `-2`, `-3`… Only those destinations are rewritten (`rewriteRelativeLinks`, the P9
  move machinery). Prose, code, wiki links and external URLs stay unchanged. The rules of normal
  uploads apply: allowed type, size limit, content sniffing and no executables. A file that fails
  keeps its original link, with a warning on the document. Missing files get a warning too. Links
  between imported documents follow a document that had to be renamed (` (2)` or a safe name).
  The preview sends other files by name only (parts typed `IMPORT_NAME_ONLY_TYPE`). The import
  then sends the content of the files the preview listed as attachments, so unused media is never
  uploaded. File contents are checked when the import runs.
- **Limits and safety:** at most 10,000 files per request and 256 MiB of retained documents and
  attachments; other files are streamed and discarded. An unsafe or repeated path rejects the whole request.
  Normal authentication and CSRF rules apply. The import runs under the `MutationLock`, plans
  again with the current library state, writes each file with `atomicCreateFile`, then refreshes
  the index once. Its writes are therefore not reported as external changes. If one item fails,
  the rest continue and the report marks that item `failed`.

## Alternatives considered

- **Server-side staging (upload once, then preview and commit by token):** avoids a second upload,
  but needs temporary storage, expiry, cleanup and per-user ownership. Markdown libraries are small
  text. Not needed now.
- **Import from a server path (a mounted folder):** convenient for Docker users. However, it lets
  the browser read arbitrary server directories and does not match UI_SPEC §134 "Select files". It
  can be added later. Copying files into `content/` already works through the watcher (§71).
- **Keep duplicate ids as they are:** the index would give one copy a provisional id, which
  changes when the file moves and drops its pins. Replacing the id at import time is more
  predictable, and the report says so.
- **Copy non-Markdown files verbatim:** they would be invisible to the app outside `.assets`
  folders. P13-06 instead copies the files documents use next to those documents.
- **One shared copy of an attachment used by several documents:** LeanDocs attachments belong to
  one document. They move, rename and go to the trash with it, so a shared copy would break on
  the first move.

## Consequences

- Positive: the HTML and Obsidian importers only add `detect`/`scan`/`convert`; placement,
  identity, limits and reporting are shared and tested once.
- Positive: the preview and the import run the same planning code, so warnings shown before the
  import match what happens. The import plans again under the lock, so concurrent changes are
  never overwritten.
- Negative: a confirmed import uploads the selection twice. Very large libraries must be
  imported in parts (10,000 files / 256 MiB of Markdown per request).
- Negative: renamed or suffixed documents can break relative links to them; the report says
  which items were renamed.
- Follow-up: P13-02 (UI and preview), P13-06 (attachments referenced by imported documents).
