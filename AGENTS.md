# AGENTS.md — Working on LeanDocs

Instructions for **every** AI coding agent (Codex, Claude Code, Cursor, …) and for humans working on this repository. Read this file completely before doing anything.

> **LeanDocs** — _Documentation without the bloat._ A lightweight, self-hosted, filesystem-first Markdown documentation manager.

---

## 1. Read order (mandatory, every session)

1. `AGENTS.md` (this file)
2. [`docs/implementation-status.md`](docs/implementation-status.md) — **current phase, task board, claims, open questions, work log**
3. [`PROJECT_SPEC.md`](PROJECT_SPEC.md) — what the app does (authoritative)
4. [`UI_SPEC.md`](UI_SPEC.md) — how it looks and behaves (authoritative for frontend work)
5. [`docs/adr/`](docs/adr/) — accepted architecture decisions
6. [`docs/development.md`](docs/development.md) — commands and local setup

`docs/archive/` contains superseded Polish drafts. **Never** use them as a source of requirements.

## 2. Non-negotiables

- **English only**: code, comments, identifiers, commit messages, docs, UI strings, status updates. (The owner may write to you in Polish; you still write everything in the repo in English.)
- **Filesystem is the source of truth.** Canonical content lives in `.md` files. SQLite is a rebuildable index only (PROJECT_SPEC §4, ADR-0001…0003).
- **Single container, no extra services** (no Postgres, Redis, queues, Elasticsearch, S3…).
- **Out-of-scope list** (PROJECT_SPEC §99) stays out unless the owner explicitly changes scope.
- **Branding** is final and defined in `BRAND_SPEC.md`. Name, tagline and wordmark split come only from `APP_NAME` / `APP_TAGLINE` / `APP_WORDMARK` in `packages/shared`. In the UI use the `AppLogo` and `Wordmark` components and the `--brand-*` / `--accent` tokens. Never redraw the logo or copy colours by hand. Brand files are generated (`branding/tools/`); do not edit exports manually.
- **Security** of Markdown/HTML/Mermaid rendering is never weakened to "get it working".
- **Never delete or skip a failing test** to go green. Fix the code or deliberately update the test when a requirement changed (and say so).
- Follow the full rule list in PROJECT_SPEC §105 (RULE 1–18).

## 3. Task tracking protocol

All progress is tracked in **one file**: `docs/implementation-status.md`. It is how agents hand work to each other. Keep it truthful.

### 3.1 Task IDs and status markers

Tasks have stable IDs `P<phase>-<nn>` (e.g. `P1-04`). Never renumber existing IDs. New tasks get the next free number in their phase.

| Marker | Meaning                                            |
| ------ | -------------------------------------------------- |
| `[ ]`  | To do                                              |
| `[~]`  | In progress (claimed)                              |
| `[x]`  | Done (meets Definition of Done, PROJECT_SPEC §101) |
| `[!]`  | Blocked (reason + link to an open question)        |
| `[-]`  | Dropped / superseded (reason required)             |

Each task line looks like:

```text
- [~] P1-04 Front matter parse/serialize — @codex 2026-10-03
- [x] P1-02 Safe path resolver — @claude-code 2026-10-03 · tests: apps/server/src/filesystem/safe-path.test.ts
- [!] P1-06 Assign missing IDs — @codex 2026-10-03 · blocked: OQ-3
```

### 3.2 Agent identity

Use a short, stable handle: `@codex`, `@claude-code`, `@cursor`, `@human-<name>`. Use the same handle in the task board, the work log and commit trailers.

### 3.3 Workflow per task

1. **Sync.** Read the status file. Check `git status` and `git log --oneline -15` to see what others did.
2. **Pick.** Take the first `[ ]` task of the **current phase** whose dependencies are done. Do not start a later phase while the current one has open tasks (RULE 13), unless the owner says so.
3. **Claim.** Change the marker to `[~]` and add `@handle YYYY-MM-DD`. If you commit, the claim is its own tiny commit or part of your first commit. Do not take a task that someone else has claimed with `[~]`. **Stale claims**: a `[~]` claim with no work-log entry or commit for more than 3 days may be taken over. Write `(taken over from @x)` and add a log entry.
4. **Work.** Make the smallest coherent increment. Write tests alongside the code.
5. **Verify.** Run `pnpm lint && pnpm typecheck && pnpm test && pnpm build`. All must pass.
6. **Close.** Mark the task `[x]` with handle, date and a short note (main files/tests). If you found follow-up work, add new `[ ]` tasks. Add known issues and decisions to their sections. If the change is visible to the user, add a `CHANGELOG.md` entry (§8).
7. **Log.** Add a work-log entry at the **top** of the _Work log_ section (template below).
8. **Update "Next up".** Rewrite the _Next up_ block so the next agent knows exactly where to start.

If you stop mid-task, leave the task as `[~]`. Write a log entry that says what is done, what is left, and anything half-finished in the working tree. **Never mark unfinished work `[x]`.**

### 3.4 Work log entry template

```markdown
### 2026-10-03 · @codex · P1-02, P1-03

- **Done:** Safe path resolver + file name sanitizer.
- **Files:** apps/server/src/filesystem/safe-path.ts, sanitize-filename.ts (+ tests)
- **Verified:** lint ✔ typecheck ✔ test ✔ (24) build ✔
- **Decisions:** none / ADR-0006 …
- **Issues/notes:** …
- **Next:** P1-04
```

### 3.5 Decisions and questions

- **Significant architecture decisions** (anything RULE 2/4 would touch, a new major dependency, a changed data format) go in an ADR: copy `docs/adr/0000-template.md` to the next number and link it in the status file. Minor decisions get one line in the _Technical decisions_ table.
- **Questions only the owner can answer** go in _Open questions_ as `OQ-n`. Mark affected tasks `[!]`. Continue with other unblocked tasks; do not guess on product decisions.

## 4. Git conventions

- Development branch: `dev`, tracking `origin/dev` at `https://github.com/pbuzdygan/leandocs.git` (owner decision, 2026-10-07). Unless the owner says otherwise, commit task-sized changes locally on `dev` or on a short-lived branch named `<handle>/<task-id>-<slug>` (e.g. `codex/P1-04-frontmatter`). **Do not push or open PRs unless the owner asks.**
- [Conventional Commits](https://www.conventionalcommits.org/) with the task ID first in the subject:

  ```text
  feat(server): P1-04 front matter parse/serialize

  Preserve unknown keys and key order on round-trip.

  Agent: codex
  ```

  Scopes: `server`, `web`, `shared`, `docs`, `ci`, `docker`, `repo`.

- Include the `Agent: <handle>` trailer, plus any attribution trailer your tool requires.
- Do not rewrite history (`rebase`, `push --force`, `reset --hard`) on commits another agent made.
- Never commit secrets, `.env` files, `data/` or `node_modules/`.

## 5. Commands

```bash
corepack enable            # once; provides the pinned pnpm version
pnpm install
pnpm dev                   # server :8080 + web :5173 (proxies /api to the server)
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm format                # prettier --write
```

Details are in `docs/development.md`. Runtime: Node.js 24 LTS (`.nvmrc`).

## 6. Repository map

```text
apps/server       Fastify API (TypeScript, ESM). Modules per PROJECT_SPEC §57.
apps/web          React + Vite frontend. Modules per PROJECT_SPEC §58; tokens in src/styles/tokens.css.
packages/shared   Code shared by web + server: constants (APP_NAME…), API types, and later the Markdown parser.
docs/             implementation-status.md, adr/, development.md, (architecture.md, markdown.md, …)
docker/           Container-related files.
```

## 7. Quality bar (Definition of Done)

A task is `[x]` only when it meets PROJECT_SPEC §101. In particular:

- typed (no `any` unless justified in a comment);
- tested where reasonable: unit tests for pure logic, integration tests against a **real temporary directory** for filesystem work, and `app.inject` for API routes;
- `pnpm lint && pnpm typecheck && pnpm test && pnpm build` all green;
- behaviour that matters is documented (spec, `docs/`, or code comments where non-obvious);
- the status file is updated;
- `CHANGELOG.md` has an entry if users will notice the change (§8).

## 8. Changelog rules

`CHANGELOG.md` is written **for users, not developers**. Every change a user will notice gets an entry under `## [Unreleased]`, in exactly one of three sections, always in this order:

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
- Keep all three section headings in `[Unreleased]` even when a section is empty. Write `- Nothing yet.` in an empty section.
- On release, rename `[Unreleased]` to `[x.y.z] — YYYY-MM-DD` and start a new empty `[Unreleased]`.

Examples:

```markdown
### New features

- You can paste a screenshot straight into a document. It is saved as a normal image file next to the document.

### Improvements

- Search results now appear instantly, even in large documentation folders.

### Bug fixes

- Renaming a document no longer breaks links to it from other documents.
```

Bad: `- Added FTS5 ranking to /api/v1/search (P8-03).` This is too technical and does not say what the user gains.

## 9. Reporting back to the owner

End every session with the report format from PROJECT_SPEC §107: Implemented / Changed files / Tests / Known limitations / Specification status / Recommended next task.
