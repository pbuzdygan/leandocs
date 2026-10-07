# ADR-0025: Bounded parsing of untrusted content

- **Status:** Accepted
- **Date:** 2026-10-07
- **Author:** @claude-code
- **Related:** PROJECT_SPEC §52, §62, §66–68; P15-02; ADR-0003, ADR-0022, ADR-0023

## Context

The second security review (P15-02) measured how the server handles content it does not control:
files in the content folder (synced, copied or edited elsewhere), saved documents and imports.

- Markdown parsing (micromark) was quadratic for documents with many quotes or list items. A local
  patch fixes that (`patches/micromark-util-edit-map@1.0.0.patch`), but parsing still needs
  roughly 750 MiB of memory per MiB of Markdown, and crafted input stays slow: 10 KiB of `*`
  took ~2 s, 80 KiB minutes, and a 1,000-deep list half a minute.
- HTML conversion during import took ~5 s per MiB and overflowed the stack on deep nesting.
- All of this ran on the server's only JavaScript thread. A slow document blocked every request;
  running out of memory is fatal in Node.js and stopped the server. On startup the index reads
  every changed file, so one such file could keep the container in a restart loop.
- A deeply nested document raised a stack overflow and was reported as unreadable, so it vanished
  from the library.

## Decision

1. **Isolated parsing.** Markdown analysis for the index (links, headings, plain text) and HTML
   conversion for imports run in one child process (`ProcessAnalyser`, entry
   `markdown/analysis-process.ts`, built as `dist/analysis-process.js`). One task runs at a time.
   Each task has a 20-second limit and the process has a 512 MiB heap
   (`DEFAULT_ANALYSIS_LIMITS`). On timeout the process is killed; when it runs out of memory or
   crashes, only that task fails. The next task starts a new process. Bodies larger than 2 MiB
   are never parsed. The process starts on first use, exits when the server exits and is not a
   separate service.
2. **Plain-text fallback.** A document that fails the limits is still listed, opened, edited and
   searched: its raw text is indexed, its links and headings are not. The reason is stored
   (`documents.analysis_limited`, migration 6), reported as the `TOO_COMPLEX` index issue and
   returned as `DocumentDto.analysisLimited`. The web app then shows the source as plain text
   and edits it in Source mode only, so the browser never parses it either.
3. **Callers that parse in the server thread check first.** Moving or renaming skips rewriting
   links inside such documents (their links were never indexed). Import analyses each document
   before it rewrites links or copies attachments; one that fails is imported unchanged with a
   warning. HTML that cannot be converted is skipped with the reason instead of failing the import.
4. **Search snippets are built in linear time** from the first 200,000 characters of the body,
   for the returned results only. FTS5's `snippet()` and `highlight()` are quadratic in the number
   of matches in one document (32,000 matches: ~10 s).

## Alternatives considered

- **Worker thread with `resourceLimits`:** tried first. When a thread reaches its heap limit,
  V8 can still abort the whole process (reproduced: exit code 134 with a 128 MiB limit), so a
  thread is not a safe boundary.
- **Heuristic limits on the input** (nesting depth, delimiter runs): every slow construct needs
  its own rule, rules can reject real documents, and missing one leaves the server exposed.
- **Size limit only:** does not help against small crafted input, which is the slow case.
- **A parser in another language:** a second implementation of the Markdown profile, with
  different results from the browser.

## Consequences

- One Node.js process more (~40 MiB) while analysis runs. Analysis has a little more latency per
  document (inter-process copy); P15-07 measures the effect at 10,000 documents.
- Each problematic file can add up to 20 seconds to startup or a refresh instead of blocking
  indefinitely. The server keeps answering requests during refreshes after startup.
- Schema version 6. Rebuilding the index recomputes the flag.
- The server test suite starts the child process through the tsx loader: about 25 % longer runs.
- Parsing for link rewriting and import still happens in the server thread, but only for
  documents that passed the limits.
- Documents read as plain text lose link tracking until they are simplified. The Settings › Index
  page lists them.
