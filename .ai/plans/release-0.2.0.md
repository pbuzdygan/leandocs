# Adopt the AI workflow and ship the next stable release (0.2.0)

The shared agent workflow is in place, the database migration guard is complete, the runtime is Node.js 26 LTS, and the owner has published the next stable release. Nothing has been released on `main` yet (only `devX.Y.Z` images), and user-visible changes are recorded in `CHANGELOG.md` under `[0.2.0] — Unreleased`. Follow-up cleanup is done or deliberately deferred. Progress is tracked here at the owner's request; delete this file when every stage is closed.

## Stage 1 — Finish the workflow migration

- [x] Owner reviewed the migration diff (`AGENTS.md`, `.ai/`, `docs/decisions.md`, spec updates).
- [x] `.ai/PROJECT.md` filled from the repository (no template placeholders left).
- [x] Committed and pushed to `dev` (`cc43af2`).
- [x] Prettier decision: kit-owned files (`AGENTS.md`, `CLAUDE.md`, `.ai/README_GUIDE.md`, `.ai/SECURITY.md`, `.ai/UI_DESIGN_GUIDELINES.md`, `.ai/plans/README.md`) are in `.prettierignore` so kit updates can be copied in verbatim without failing `pnpm format:check`; project-owned `.ai/` files stay formatted.

## Stage 2 — Migration guard

- [x] Schema v8 fingerprint added to `RELEASED_SCHEMAS` (`apps/server/src/db/upgrade.test.ts`); v8 is data-only, so it equals v7's. Migrations are unchanged since `dev0.1.2`.
- [x] `docs/migrations.md`: version 8 listed as released in `dev0.1.2`.
- [x] Verified (see Stage 2b).

## Stage 2b — Node.js 26 LTS and changelog version (owner request, 2026-10-15)

- [x] Node.js 26 (LTS 2026-10-28, end of life 2029-04-30): `.nvmrc`, `engines`, `@types/node` `^26`, tsup `node26`.
- [x] Docker: `node:26-trixie-slim` build + `distroless/nodejs26-debian13` runtime, pinned by digest; Dependabot comments.
- [x] Node.js 25+ ships no corepack: Docker, CI and release workflow install `corepack@0.36.0` from npm.
- [x] Docs: `docs/development.md`, ADR-0004 and ADR-0024 amendments, D-67 in `docs/decisions.md`.
- [x] `CHANGELOG.md`: `[0.2.0] — Unreleased` with a user-facing entry; `CONTRIBUTING.md` changelog rule adjusted.
- [x] Local: nvm Node 26 has corepack 0.36.0 installed; `.nvmrc` matches, so the nvm warning is gone.
- [x] Verified on Node 26: format, lint, typecheck, 726 unit/API tests, build; Docker build (296 MB, was 256 MB: base image only); `pnpm test:upgrade` from `dev0.1.4`; `pnpm test:backup`.
- [x] Browser tests (Chromium) with the server on Node 26: 81 passed, including visual baselines.
- [x] Owner committed and pushed (`aef38fa`).
- [x] CI green on `dev` (owner, `07eb99e`).

## Stage 3 — Release 0.2.0 (owner publishes)

- [x] `[0.1.0]` was never released on `main`: folded into `[0.2.0] — Unreleased` as the first stable release (owner decision).
- [x] Version: releases use only the tag (D-53); non-release builds now report the fixed `0.0.0-dev` (D-68), so no file is edited per release.
- [x] CI browser tests: Chromium on `dev` pushes, all three engines on pull requests and `main` (D-69).
- [x] Release checks (PROJECT_SPEC §102) on `07eb99e`, image built with `LEANDOCS_VERSION=0.2.0`: CI green on `dev` and on the `dev` → `main` PR (all three engines); fresh install in the hardened configuration (reports 0.2.0, migrations 0 → 8, healthy, setup ready, CSP present); `pnpm test:upgrade` from `dev0.1.4`; `pnpm test:backup`.
- [x] `CHANGELOG.md`: `[0.2.0] — 2026-10-15` (change the date if the release is published later) and a new empty `[Unreleased]`; release-facing docs updated (README status, `SECURITY.md`, deployment notes, `0.2.0` examples, image size).
- [ ] Owner commits and pushes the release-preparation changes; CI green on the PR.
- [ ] Merge `dev` → `main` through a pull request.
- [ ] Owner publishes GitHub release `0.2.0` on `main`; the release workflow pushes `0.2.0` and `latest`.
- [x] `SECURITY.md` and PROJECT_SPEC §108 updated for the release (done with the release preparation).
- [ ] After release: `latest` and `0.2.0` exist on GHCR, `docker compose pull` works without login (make the package public if needed), Dependabot runs from `main`.
- [ ] Owner decides the license (OQ-1 in `docs/decisions.md`), ideally before wider publicity.

## Stage 4 — Low-priority cleanup (independent items)

- [ ] Restructure `README.md` following `.ai/README_GUIDE.md`.
- [ ] Historical task IDs and "(Phase N)" headings in `docs/architecture.md`, `docs/development.md`, `docs/accessibility.md`: replace only when those sections are edited anyway (decided: no bulk rewrite).
- [ ] Known issues in `docs/decisions.md`: close KI-13/KI-14 when `tsup`/Mermaid allow the fixed versions; watch KI-12 in CI.
- [ ] Post-1.0 roadmap (PROJECT_SPEC §111): owner chooses next features; larger work gets its own plan here.

## Closing

- [ ] All stages closed or explicitly deferred; delete this plan and clear any `.ai/STATE.md` note.

## References

- Project profile: `.ai/PROJECT.md`
- Release procedure: `docs/development.md` (Releasing), `docs/migrations.md`
- Decisions and known issues: `docs/decisions.md`; runtime: ADR-0004 and ADR-0024 amendments, D-67
