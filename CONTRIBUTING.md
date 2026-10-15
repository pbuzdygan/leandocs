# Contributing

LeanDocs is built mostly by AI coding agents (Codex, Claude Code) under the owner's direction. The same rules apply to human contributors.

1. Read [`AGENTS.md`](AGENTS.md) (shared working rules) and [`.ai/PROJECT.md`](.ai/PROJECT.md) (LeanDocs constraints, verification and protected resources).
2. Keep changes small and coherent. Run `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build` before committing; see [`docs/development.md`](docs/development.md) for browser and performance tests.
3. Use [Conventional Commits](https://www.conventionalcommits.org/) with a scope: `server`, `web`, `shared`, `docs`, `ci`, `docker` or `repo` (for example `feat(server): preserve unknown front matter keys`).
4. Add a `CHANGELOG.md` entry for every change users will notice (see [Changelog](#changelog)).
5. Write in English: code, comments, commits and docs.
6. Record significant decisions as ADRs in [`docs/adr/`](docs/adr/) and smaller ones in [`docs/decisions.md`](docs/decisions.md).

Scope is intentionally narrow. Read PROJECT_SPEC §99 ("out of scope") and §104 ("anti-overengineering") before proposing features.

## Changelog

`CHANGELOG.md` is written **for users, not developers**. Every change a user will notice gets an entry in the topmost section, `## [x.y.z] — Unreleased` (the version being prepared; `## [Unreleased]` when none is chosen yet), in exactly one of three sections, always in this order:

| Section            | What goes there                                                                        |
| ------------------ | -------------------------------------------------------------------------------------- |
| `### New features` | Something the user can now do that they could not do before                            |
| `### Improvements` | Something that already worked and now works better, faster, safer or more conveniently |
| `### Bug fixes`    | Something that was broken and now works as expected                                    |

How to write an entry:

- **One short sentence or two** that say what the user gets, in plain language. Describe the effect, not the implementation.
- **No technical jargon**: no file names, function names, libraries, HTTP codes or task IDs. Words the user sees in the UI or in their files (e.g. "Markdown", "folder", "Docker") are fine.
- Start with what changed for the user, then why it matters if that is not obvious.
- Purely internal work (refactoring, tests, CI, tooling, specs) gets **no entry** unless it has a noticeable effect, and then the entry describes that effect.
- Keep all three section headings in the unreleased section even when a section is empty. Write `- Nothing yet.` in an empty section.
- On release, replace `Unreleased` in the heading with the release date (`[x.y.z] — YYYY-MM-DD`) and start a new empty section above it.

Examples:

```markdown
### New features

- You can paste a screenshot straight into a document. It is saved as a normal image file next to the document.

### Improvements

- Search results now appear instantly, even in large documentation folders.

### Bug fixes

- Renaming a document no longer breaks links to it from other documents.
```

Bad: `- Added FTS5 ranking to /api/v1/search.` This is too technical and does not say what the user gains.
