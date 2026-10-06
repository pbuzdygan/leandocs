# ADR-0009: Local authentication storage and password hashing

- **Status:** Accepted
- **Date:** 2026-10-04
- **Author:** @codex
- **Related:** PROJECT_SPEC §48–52, §63; ADR-0003; P11-01

## Context

Local authentication needs durable credentials and sessions without extra services. Version 1.0
is single-user. Credentials are application data, not part of the rebuildable document index.
The runtime is Node.js 24 and the specification permits argon2id or scrypt.

## Decision

- Append schema migration 4; do not alter migrations 1–3. Store one administrator in `users`
  (`id = 1`, username, password hash, creation date). Username comparison uses SQLite NOCASE
  (ASCII case-insensitivity). Account creation and username validation come in P11-02.
- Use Node's stable asynchronous `crypto.scrypt` with `N=131072`, `r=8`, `p=1`, a fresh random
  16-byte salt and a 32-byte derived key. Allow 160 MiB `maxmem` for the roughly 128 MiB cost
  plus overhead. This follows one of OWASP's recommended scrypt configurations.
- Store hashes as `$scrypt$v=1$N=131072,r=8,p=1$<32 lowercase salt hex characters>$<64 lowercase key hex characters>`.
  The verifier accepts only this exact version and parameter set, so malformed database values
  cannot request unbounded work. Future parameter changes need an explicit compatible verifier.
- Compare derived keys with `crypto.timingSafeEqual`. Invalid encodings or incorrect passwords
  return false; crypto/runtime failures propagate rather than masquerading as wrong credentials.
- Preserve passwords as exact UTF-8 input, without trimming, normalization or truncation.
  Reject empty input and input exceeding 1024 UTF-8 bytes before invoking scrypt. This is a
  resource bound, not the minimum account password policy (P11-02).
- Prepare `sessions` for SHA-256 digests of random bearer tokens, never the cookie tokens
  themselves. Each session references the administrator with cascading deletion, records integer
  Unix-second creation/expiry times, and has indexes for user lookup and expiry cleanup.
  Token generation, lifetime, revocation and cookies are implemented in P11-03.
- Document-index rebuilds preserve both tables. Deleting `app.db` loses accounts and sessions,
  like other app metadata; it never loses Markdown files.

## Alternatives considered

- **Argon2id:** a good permitted alternative, available as a newer built-in API since Node 24.7
  or through a native dependency. Scrypt uses the longer-established Node API and is explicitly
  permitted by the specification, with no dependency or packaging changes.
- **Synchronous scrypt:** rejected because password work would block the server event loop.
- **Plaintext passwords or session tokens:** rejected because a database leak would expose credentials.
- **Configurable cost from stored hashes:** deferred; fixed versioned parameters keep work bounded.

## Consequences

Password operations use the libuv worker pool and roughly 128 MiB each. P11-03/P11-08 must
account for concurrency and rate limiting before exposing login. Invalid encodings fail before
hashing, so login must handle missing accounts without introducing a username timing oracle.
Setup, login, cookies and route protection remain subsequent tasks; this task exposes no auth API.
This internal foundation has no user-visible changelog entry.

References checked on 2026-10-04:

- [Node.js 24 crypto documentation](https://nodejs.org/docs/latest-v24.x/api/crypto.html#cryptoscryptpassword-salt-keylen-options-callback)
- [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#scrypt)

## Amendment (2026-10-04, owner request)

The password-hashing choice is superseded by [ADR-0011](0011-argon2id-and-mfa-plan.md): new hashes use Argon2id; existing scrypt hashes remain verifiable and upgrade on successful login. Schema/storage decisions remain accepted.

## Security recovery amendment — 2026-10-04

[ADR-0019](0019-fail-closed-authentication-recovery.md) supersedes historical database-deletion/recreation guidance. The derived document index remains rebuildable, but accounts, sessions and MFA are durable authentication data. Never delete or replace `app.db` to repair search. Corrupt/missing/reset initialized databases refuse startup; restore the matching system backup. Index rebuilds clear derived tables only.
