# ADR-0010: First-run administrator setup

- **Status:** Accepted
- **Date:** 2026-10-04
- **Author:** @codex
- **Related:** PROJECT_SPEC §48–52; UI_SPEC §89–90, §126; P11-02; ADR-0009

## Context

The first local account must be created without an existing session. Setup must survive restarts,
never replace an administrator, and avoid cross-site account creation or unbounded hashing.
Login and general API authentication are implemented separately in P11-03.

## Decision

- `GET /api/v1/auth/setup` returns whether an account is required, the actual resolved content
  directory and, only before account creation, a random 32-byte process-local setup token.
  `POST /api/v1/auth/setup` requires that token in `X-LeanDocs-Setup-Token`, JSON input and no
  cross-site Fetch Metadata marker. No CORS access is granted. All setup responses use `no-store`.
  The token is kept in browser query memory, never in local storage, logs or URL parameters.
- Accept one creation operation per server instance at a time; reject concurrent attempts.
  After asynchronous hashing, insert with the database singleton constraint and `INSERT OR IGNORE`.
  This closes races across server instances without overwriting credentials. Once an account
  exists, creation returns `SETUP_COMPLETE` and status no longer exposes a token.
- Username: trim outer whitespace, allow 1–64 ASCII letters/digits/dots/underscores/hyphens,
  and require a leading letter or digit. This makes SQLite NOCASE matching predictable.
- Password: at least 15 Unicode code points, at most 1024 UTF-8 bytes; accept spaces and Unicode
  without composition rules or normalization. Reject unpaired surrogates and require exact
  confirmation. Fifteen characters follows OWASP's guidance when MFA is absent. Shared
  validation gives the UI and server the same policy; server validation is authoritative.
- Bound the JSON request to 16 KiB, reject additional fields, and never return password hashes.
  Successful setup creates only the administrator; session cookies belong to P11-03.
- The browser checks setup before mounting the app shell, redirects unconfigured installations
  to `/setup`, and shows the account → storage → Ready steps from UI_SPEC §90. Configured
  installations show an explanatory completion state at `/setup` instead of another form.
- Until P11-03, the Ready action opens documentation with the existing API behavior. This
  increment does not claim that documents are protected by authentication yet.

## Alternatives considered

- **Overwriting credentials when setup repeats:** rejected; revisiting setup must not reset an account.
- **Holding a SQLite transaction while hashing:** rejected; hashing is asynchronous and would
  unnecessarily hold a database write lock. The final singleton insert resolves races.
- **Unauthenticated cross-site form submission:** rejected; a custom-header token and JSON protect
  this sensitive bootstrap endpoint before the general CSRF work in P11-06.
- **Password complexity rules:** rejected; long passphrases are supported without restricting
  character choices. Breached-password screening is not added to this increment.

## Consequences

Setup tokens change on restart; an open form must reload before submitting after a restart.
In a multi-process deployment requests must reach the same instance; the supported deployment
is a single container. Anyone with direct access before initial setup can create the first account,
as with the specified bootstrap flow. Existing Markdown files are never rewritten by account creation.
The browser E2E setup project creates an account before existing content tests run.

Reference checked on 2026-10-04:

- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html#implement-proper-password-strength-controls)
