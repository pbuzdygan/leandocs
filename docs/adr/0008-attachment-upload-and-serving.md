# ADR-0008: Attachment upload and safe serving

- **Status:** Accepted
- **Date:** 2026-10-02
- **Author:** @codex
- **Related:** PROJECT_SPEC §13–15, Phase 7

## Context

Attachments must remain portable files alongside each Markdown document. Uploads must reject unsafe names, executable files, incorrect types and excessive sizes. SVG must not execute scripts when opened directly. Both editors need to insert links without losing edits made during an upload.

## Decision

Use pinned `@fastify/multipart` 10.1.2 for bounded multipart parsing and `file-type` 22.1.1 for binary type detection. Accept exactly one `file` part per request. Consume and validate the full request before creating any file. `MAX_UPLOAD_SIZE` is a byte count, defaults to 50 MiB and supports positive integer values up to 1 GiB. Text formats require UTF-8 without NUL; JSON must parse; SVG must contain an SVG element without DTD/entity declarations. Binary types must match their extension and declared MIME type. Empty/octet-stream browser MIME is accepted only when content validation passes. Executable signatures are rejected.

Store files in `<document>.assets/` with safe readable names. Collisions get a random suffix; existing files are never overwritten. Use the existing exclusive atomic writer and shared mutation lock. Reject symlink asset directories and file symlinks. File reads use `O_NOFOLLOW`, inspect the opened file and validate its content again before serving.

Expose list/upload at `/api/v1/documents/:id/attachments` and read/delete at `/api/v1/documents/:id/attachments/:filename`. Images are inline; other files download. `?download=1` forces image download. Responses include canonical MIME, `nosniff`, no-store, UTF-8 filenames and a sandbox CSP with no scripts or external resources. Preserve uploaded SVG bytes; the CSP blocks active content even on direct navigation, and rendering uses image elements.

Canonical Markdown uses encoded relative `.assets` paths. Resolve those paths to ID-based API URLs at render time; the visual editor keeps the original source URL in its document model. Upload insertion anchors map through concurrent editor changes. Visual uploads show a temporary widget, and failed uploads leave Markdown unchanged. Each file in a multi-file selection uploads independently; successful files are inserted even if another file fails. Mode switching and Done wait until uploads finish. Leaving by another route may leave an uploaded but unreferenced file; the attachment panel lists it for review/deletion.

Delete attachments permanently only after UI confirmation explaining that links will break. Documents and assets use the existing move/trash/restore lifecycle. Renaming also rewrites the document's parsed Markdown destinations that point directly to its own asset directory, preserving other source bytes. Broader relative-link rewriting remains P9-05, including links from other documents and raw HTML.

## Alternatives considered

- A global blob store or database BLOBs: violates filesystem ownership and portability.
- Trusting only multipart MIME/extension: client-controlled metadata cannot prove the file type.
- Sanitizing SVG on upload: changes canonical bytes; sandboxed delivery preserves originals.
- Inserting temporary Markdown placeholders: autosave could persist incomplete upload state.

## Consequences

Memory usage per upload is bounded by the configured per-file size; uploads are buffered for validation. This is appropriate for the single-user deployment, but large configured limits increase memory usage. ZIP contents are not unpacked or inspected. Signature detection verifies file types, not full format correctness. External filesystem writers can still race app operations; the mutation lock serializes application operations only. Image display may reject active/external SVG resources by design. Authentication will protect these routes alongside other APIs in Phase 11.
