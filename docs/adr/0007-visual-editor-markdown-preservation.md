# ADR-0007: Visual editing preserves original Markdown blocks

- **Status:** Accepted
- **Date:** 2026-10-02
- **Author:** @codex
- **Related:** PROJECT_SPEC §7, §17, Phase 6; ADR-0002; P6-01…P6-05

## Context

Milkdown is the specified visual editor. Its default Markdown transformations can normalise syntax and replace references, while arbitrary HTML and LeanDocs extensions do not have equivalent visual editing schemas. Switching modes must preserve semantically significant content and avoid unrelated rewrites.

## Decision

- Use the headless `@milkdown/kit` pinned to 7.22.2 with CommonMark, GFM and history. Style it with existing tokens and renderer typography; no packaged editor theme.
- Reuse `EditorSession` for Source and Visual modes. Only Markdown body strings reach the API; front matter remains managed by the server's minimal-diff writer.
- Run directive parsing and preservation before Milkdown's normalising transforms. Unsupported blocks (including enclosing blocks containing raw HTML, wiki links, directives or references) become selectable opaque nodes with their original text. They render as text, never executable HTML, and can be edited in Source mode.
- Preserve original source for unchanged top-level ProseMirror nodes during a visual session. Serialize changed blocks through Milkdown. Opening Visual without editing never initiates a save or rewrites Markdown.
- Observe document transactions synchronously rather than relying on a debounced Markdown listener. A mode switch or immediate Save sees the latest edit.
- Sanitize normal visual-editor link/image URL attributes as well; opaque source is never injected into the DOM as HTML.
- Validate with actual Milkdown parser/editor/serializer round-trip fixtures and browser tests asserting physical Markdown and front-matter preservation.

## Alternatives considered

- **Persist ProseMirror JSON or HTML.** Rejected by filesystem-first and Markdown-first requirements.
- **Normalise the entire document on every visual edit.** Rejected: unnecessary diffs and potential extension/reference loss.
- **Silently drop unsupported nodes.** Rejected: data loss.
- **Implement arbitrary HTML visual editing.** Outside the required visual editor scope; Source is the supported escape hatch.

## Consequences

Typical CommonMark/GFM prose can be authored visually. Complex extension/reference blocks remain explicit and preserved, with edits made in Source. Unsupported inline syntax protects its enclosing block as a unit. Unchanged-block source tracking is ephemeral and never stored as a proprietary file format. Whitespace between blocks can be normalised after an actual visual edit; untouched blocks retain their own source. Images use existing locations; uploads and attachment commands arrive in Phase 7.

## Amendment (2026-10-02, @claude-code, owner feedback)

Callouts were preserved as opaque atoms, and typing while one was selected replaced (deleted) it. Known callouts — `:::note|info|tip|warning|danger`, optional `[label]`, **no `{attributes}`** — are now an editable `callout` node (`editor/visual/blocks.ts`) whose content is ordinary blocks; the label is kept as the title and the type can be changed. Serialisation goes back through remark-directive, so the Markdown stays `:::type[label]` … `:::`. A callout with attributes, or whose content needs preservation itself (raw HTML, wiki links, other directives), stays a preserved block as before. Unchanged top-level blocks still keep their exact source.

## Amendment 2 (2026-10-02, @claude-code, P9-06)

Paragraphs containing wiki links were preserved as opaque blocks, and a `[[link]]` typed in Visual was saved escaped as `\[\[link]]`. Wiki links are now an inline `wiki_link` node: `[[…]]` in text is split into nodes when the editor parses Markdown, and each node is written back verbatim as `[[target#heading|alias]]` (parts that would end or restructure the token, or start raw HTML, are dropped). Their paragraphs are therefore editable; the other preservation rules are unchanged.
