# ADR-0012: Local sessions and API protection

- **Status:** Accepted
- **Date:** 2026-10-04
- **Author:** @codex
- **Related:** PROJECT_SPEC §48–52; UI_SPEC §89, §126; P11-03; ADR-0009–0011

## Context

Administrator setup is complete. Local login must protect all content APIs, preserve session
state across restart, and work through an HTTPS reverse proxy without trusting arbitrary headers.
MFA, general CSRF, proxy identity and the final security review remain subsequent tasks.

## Decision

- Provide `POST /auth/login`, `POST /auth/logout`, `GET /auth/session` under `/api/v1`.
  Session status is public and returns a user or null plus a CSRF token, never the bearer token.
- Use random 32-byte session tokens in host-only `leandocs_session` cookies: `Path=/`, `HttpOnly`,
  `SameSite=Strict`, eight-hour `Max-Age`. Store SHA-256 token digests and absolute expiry in the
  existing sessions table. Validate expiry on every protected request and lazily remove expired
  rows. Login rotates the current cookie's session; logout deletes its row and expires the cookie.
- Add `Secure` for HTTPS requests or explicit `SESSION_COOKIE_SECURE=true`. This flag is needed
  when TLS terminates at a reverse proxy. Do not trust forwarded identity or scheme headers;
  trusted-proxy handling remains P11-04. Local HTTP development keeps a usable non-Secure cookie.
- Enforce authentication before parsing/validation for every registered API route by default.
  Use Fastify's canonical route URL, not the raw requested path. Only health, setup, login and
  session status are public (including applicable HEAD variants). Static app assets remain public.
  A test walks the registered routes and fails if any other endpoint permits anonymous access.
- For all supplied usernames, verify against the same single account hash, or a fixed Argon2id
  dummy if no account exists. Failed attempts return identical credential errors. Legacy scrypt
  upgrades occur only on successful login; a conditional update and session insertion happen
  in one transaction, so concurrent account changes cannot authenticate with outdated credentials.
- Bound login hashing to one in-flight operation. Provide a preliminary five-attempts-per-minute
  limit per direct peer IP with a bounded in-memory map (1000 entries) and `Retry-After` on 429.
  P11-08 will expand review/coverage for account limits, proxy-derived addresses and MFA.
- Login/logout require a custom-header CSRF token and reject cross-site Fetch Metadata. The
  anonymous token is process-local; authenticated tokens are SHA-256 of `csrf:` plus the bearer
  token. Same-origin GET session status supplies the current token. Tokens are not written to
  browser storage. General content-mutation CSRF enforcement remains P11-06.
- Login UI is the existing neutral 360 px form. First-run Ready leads to login. Authenticated
  users return to their requested internal document path, get a user menu and can sign out.
  Search/content action providers mount only within the authenticated app shell. Logout and
  API authentication failures clear cached document data; local recovery drafts retain their
  existing browser-only behavior. Password fields clear on success and are not persisted.

## Alternatives considered

- **JWTs in browser storage:** rejected; opaque HttpOnly cookies allow straightforward revocation.
- **Trust all forwarded headers:** rejected; public callers must not spoof identity or HTTPS.
- **Per-route opt-in authentication:** rejected; new endpoints could accidentally expose content.
- **Immediate MFA implementation:** deferred to P11-11 after session/CSRF/throttling foundations,
  as recorded in ADR-0011; this increment grants a full session after password authentication only.

## Consequences

Sessions survive restarts; deleting `app.db` loses accounts and sessions but not documents.
An HTTP-only preview cannot use `SESSION_COOKIE_SECURE=true`. At an HTTPS proxy, enable the
flag and prevent direct public access to the backend. Bootstrap/logout CSRF protection does
not complete P11-06. No claim of production/public readiness is made before remaining hardening.
The browser setup test saves its authenticated cookie state for content tests. Server content
tests authenticate using real setup/login; production authentication has no testing bypass.

Reference checked on 2026-10-04:

- [OWASP Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)

## Security recovery amendment — 2026-10-04

[ADR-0019](0019-fail-closed-authentication-recovery.md) supersedes historical database-deletion/recreation guidance. The derived document index remains rebuildable, but accounts, sessions and MFA are durable authentication data. Never delete or replace `app.db` to repair search. Corrupt/missing/reset initialized databases refuse startup; restore the matching system backup. Index rebuilds clear derived tables only.
