# ADR-0011: Argon2id hashing and staged MFA

- **Status:** Accepted
- **Date:** 2026-10-04
- **Author:** @codex, owner-authorized
- **Related:** PROJECT_SPEC §49–52; P11-10, P11-03, P11-11; supersedes ADR-0009's hashing choice

## Context

The owner wants Argon2id before further authentication work and delegates the decision on when
to implement MFA for potential public deployment. Existing scrypt accounts must remain usable.

## Decision

Use Node's asynchronous `crypto.argon2('argon2id', …)` with 65536 KiB memory, three passes,
parallelism one, a random 16-byte salt and a 32-byte key. Require Node >=24.7.0. Store standard
PHC strings `$argon2id$v=19$m=65536,t=3,p=1$<unpadded base64 salt>$<unpadded base64 key>`.
Only that precise parameter set and canonical encoding are accepted; costs cannot be selected
by untrusted stored values. Preserve exact password input and the existing 1024-byte bound.

Retain verification for the exact legacy scrypt format from ADR-0009. New setup always writes
Argon2id. Successful legacy login rehashes with a fresh Argon2id salt and updates the row using
the previous hash as a condition; a failed login never rewrites credentials. No schema change
or offline conversion is needed, since rehashing requires the password.

Implement optional local TOTP MFA as P11-11 later in the current Phase 11, after P11-03
(sessions), P11-06 (CSRF) and P11-08 (login throttling), before P11-09's final security review
and public local-auth release. Include enrollment confirmation, protected secret storage,
second-factor login before any authenticated session, single-use hashed recovery codes,
reauthenticated disablement, replay prevention and abuse tests. This is authorized scope,
not implemented functionality. Keep the 15-character minimum for now. Trusted proxy MFA
can be used through P11-04; the backend must not be reachable around that gateway.

## Alternatives considered

- **Continue scrypt for new accounts:** secure with the existing costs, but superseded by the
  owner's choice of the OWASP-preferred Argon2id.
- **Delete/recreate accounts:** rejected; legacy verification permits a seamless transition.
- **Implement MFA before sessions:** rejected; enrollment, recovery and second-factor state
  require the session/CSRF/throttling foundation and must not accidentally grant partial login.
- **Defer MFA until after 1.0:** rejected for the planned public local-auth use; track it explicitly
  within Phase 11 and include it in the security review.

## Consequences

New hashes use roughly 64 MiB per operation, legacy verification roughly 128 MiB. Bound
authentication concurrency and rate-limit attempts before public deployment. Users can still
sign in with their existing scrypt password. Runtime pinning and Docker's Node 24 build must
include Argon2id support. MFA remains pending; no claim of MFA protection is made today.

References checked on 2026-10-04:

- [Node.js 24 crypto](https://nodejs.org/docs/latest-v24.x/api/crypto.html#cryptoargon2algorithm-parameters-callback)
- [OWASP password storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#argon2id)
