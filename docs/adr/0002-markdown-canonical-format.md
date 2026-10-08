# ADR-0002: Markdown with YAML front matter is the canonical document format

- **Status:** Accepted
- **Date:** 2026-10-02
- **Author:** project owner (recorded by @claude-code)
- **Related:** PROJECT_SPEC §4.2, §8–10, §16–22

## Context

Users want WYSIWYG comfort, but the stored format must stay readable and portable (`cat document.md` must make sense).

## Decision

- Documents are `.md` files: CommonMark + GFM, plus the LeanDocs extensions — callouts (`:::type` container directives), wiki links (`[[Title]]`) and Mermaid fences.
- Metadata lives in YAML front matter (`id`, `title`, `created`, `updated` required; `tags`, `aliases`, `icon`, `template`, `description` optional). Unknown keys are preserved.
- The visual editor (Milkdown/ProseMirror) and the source editor (CodeMirror) both edit the same Markdown. ProseMirror/TipTap JSON or editor HTML is never persisted.
- There is a single note type in 1.0. Raw HTML inside Markdown is allowed but sanitised, and it is edited in Source mode.
- File names are human-readable. The stable identity is the UUID in front matter.

## Alternatives considered

- **Two note types (Markdown + HTML), as in Poznote.** Deferred. This may be reconsidered after real usage.
- **UUID file names.** Rejected because they are not human-friendly.

## Consequences

- A Visual→Source→Visual round-trip fixture suite is mandatory (Phase 6).
- Serialisation must minimise diffs on user files (RULE 10).
