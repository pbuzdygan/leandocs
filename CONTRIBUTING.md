# Contributing

LeanDocs is built mostly by AI coding agents (Codex, Claude Code) working in turns under the owner's direction. The same rules apply to human contributors.

1. Read [`AGENTS.md`](AGENTS.md). It covers the workflow, task claiming, commit conventions and quality gates.
2. Pick or claim a task in [`docs/implementation-status.md`](docs/implementation-status.md).
3. Keep changes task-sized. Run `pnpm lint && pnpm typecheck && pnpm test && pnpm build` before committing.
4. Add a user-facing `CHANGELOG.md` entry for every change users will notice: New features, Improvements or Bug fixes, in short, non-technical language (`AGENTS.md` §8).
5. Write in English: code, comments, commits and docs.
6. Record significant decisions as ADRs in [`docs/adr/`](docs/adr/).

Scope is intentionally narrow. Read PROJECT_SPEC §99 ("out of scope") and §104 ("anti-overengineering") before proposing features.
