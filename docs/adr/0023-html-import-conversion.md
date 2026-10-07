# ADR-0023: HTML import converts through syntax trees (hast → mdast)

- **Status:** Accepted
- **Date:** 2026-10-07
- **Author:** @claude-code
- **Related:** PROJECT_SPEC §52, §66, §68, §104; UI_SPEC §134–135; P13-03; ADR-0022

## Context

PROJECT_SPEC §68: `.html → HTML parser → Markdown conversion → review report`. The report lists
elements that could not be converted safely, and original files are never deleted. The server
must never execute or render the imported HTML. The Markdown pipeline already uses the
unified/remark syntax-tree ecosystem (`remark-parse`, `remark-gfm`, `mdast-util-to-hast`).

## Decision

- Convert on the server with five small syntax-tree utilities from the same ecosystem, versions
  pinned: `hast-util-from-html` (spec-compliant parse5 parser, no DOM, no scripts),
  `hast-util-to-mdast`, `mdast-util-to-markdown` (2.1.3, the version `mdast-util-gfm` uses),
  `mdast-util-gfm` (tables, strikethrough, task lists) and `unist-util-visit`.
- Before conversion, `import/html.ts` walks the HTML tree. It removes `<head>` (its `<title>`
  becomes the front matter `title`). It removes scripts, embedded pages and objects, media,
  drawings, formulas and forms. Links that could run code keep only their text. Images stored as
  `data:` URLs keep only their description. Each kind of loss becomes one report warning: removed
  elements, formatting Markdown cannot express (underline, highlight, sub/superscript,
  collapsible sections), merged table cells, inline styles, and local images that are not
  imported yet (P13-06). Relative links to `.html`/`.htm` pages are rewritten to the converted
  `.md` files and reported as a note.
- Encoding follows a simplified version of the HTML standard: byte order mark, then the
  `<meta charset>` declaration, then UTF-8, then Windows-1252 with a warning. Unsupported declared
  encodings skip the file with a reason.
- The output contains no raw HTML nodes (the converter never produces them). The result is an
  ordinary document and is rendered through the existing sanitised pipeline. Placement, identity
  and writing are the shared ADR-0022 steps.

## §104 checklist

1. _Problem:_ HTML → Markdown conversion for P13-03 (required by §68).
2. _Exists now:_ yes; the import UI offers HTML files.
3. _Simpler mechanism:_ a hand-written converter would have to reimplement HTML parsing (an
   unsafe area) and Markdown escaping. The chosen packages are the reference implementations
   behind the libraries already in use.
4. _User dependency on the app:_ none; output is plain Markdown.
5. _Migration harder:_ no.
6. _Additional service:_ no; pure JavaScript, in-process.
7. _Risk of losing documentation:_ no; originals stay with the user, conversions are new files and
   losses are reported before import.

## Alternatives considered

- **turndown:** popular, but in Node it needs a DOM implementation (domino). It reports nothing
  about dropped content, so the §68 report would need a separate parse anyway.
- **rehype-parse + rehype-remark + remark-stringify:** the same utilities wrapped in unified
  plugins. The wrappers add no value here, because the importer works on the trees directly.

## Consequences

- 11 new packages in the lockfile, all small and from the same maintainers as existing
  dependencies.
- Adding a new HTML construct to the report is one entry in the `REMOVED` or `FLATTENED`
  tables.
- Follow-up: images referenced by converted pages arrive with P13-06.
