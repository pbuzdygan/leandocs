# Phase 11 security review

**Date:** 2026-10-04 · **Reviewer:** @codex · **Task:** P11-09 · **Scope:** PROJECT_SPEC §52 and completed local MFA.

This is an implementation review with regression tests, not an external penetration test or release certification. Production deployment and the broader dependency, performance, upgrade and browser audits remain in Phases 14–15. No owner data, environment or running preview was changed.

## Findings and corrections

| Finding                                            | Effect and correction                                                                                                                                                                                                                                       | Evidence                                                     |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| KI-11: automatic replacement of corrupt SQLite     | Discarded accounts/MFA and reopened setup. Startup now refuses invalid databases without replacement. A private durable initialization marker also prevents missing/reset databases from reopening setup. Matching backups recover existing authentication. | `api/auth-recovery.test.ts`, `db/database.test.ts`; ADR-0019 |
| Templates followed filesystem links                | A linked template/root could read outside content. Validate the root with the existing contained-directory resolver and use no-follow regular-file reads.                                                                                                   | `templates/security.test.ts`, `api/templates.test.ts`        |
| Trash trusted root, metadata and restore ancestors | A linked root/item/metadata/payload or restore parent could read/write outside content. Validate each path before access; create destinations with the existing safe directory helper.                                                                      | `trash/security.test.ts`, `api/lifecycle.test.ts`            |
| Cached document reads followed replaced file links | A previously indexed file replaced with a symlink could expose outside content before refresh. Validate its parent and use no-follow regular-file opens.                                                                                                    | `api/documents.test.ts` covers read, raw download and save   |

Authentication recovery deliberately changes the old corrupt-database and critical-test-B expectations. Those tests now verify preserved evidence and index rebuilding without discarding accounts. Fresh isolated index tests retain the filesystem-portability guarantee. No failing test was skipped or removed.

## Reviewed surfaces

| Surface                          | Controls reviewed                                                                                                                                                                                         | Validation                                                                               |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Passwords and local setup        | Native Argon2id, bounded parameters/concurrency, legacy scrypt upgrade, exact inputs, 15-character minimum, one administrator, setup nonce, initialization marker before account insertion                | Password/setup/login/recovery tests                                                      |
| Sessions and route authorization | Random tokens stored as digests, expiry/revocation/rotation, HttpOnly/SameSite cookies, canonical route guard before parsing, explicit public routes                                                      | Session/auth API tests and local browser tests                                           |
| Proxy and unauthenticated modes  | Explicit opt-in; trusted direct peer plus exact single user header; nonlocal modes reject local credential/MFA routes; none mode warns users                                                              | Proxy/none API and isolated browser projects                                             |
| CSRF                             | Session-bound nonce, one validated header, constant-time comparison, mutation coverage including uploads, origin/fetch metadata checks and optional public-origin pinning                                 | CSRF API and browser tests                                                               |
| Login throttling                 | Shared password/factor attempt budget, peer/global rolling limits, bounded challenge state, one password verification in flight                                                                           | Rate-limit and MFA tests; browser MFA uses the real wait                                 |
| MFA                              | Confirmed TOTP enrollment, encrypted secret with private no-follow key, replay rejection, expiring bounded challenges, transactional one-use recovery, password-plus-factor disablement, session rotation | MFA API/key/service/UI tests and isolated real-browser enrollment/login/recovery/disable |
| Rendering                        | Sanitized raw HTML and active URLs, owned heading IDs, safe editor URL handling, Mermaid strict mode, restricted CSP and attachment sandbox                                                               | Markdown/XSS/component tests and real-browser rendering/security-header tests            |
| Filesystem and uploads           | Contained lexical/real paths, ignored scanned symlinks, safe atomic writes, validated no-follow reads, bounded multipart uploads, extension/content checks                                                | Safe-path, document, lifecycle, template, attachment and upload tests                    |
| Search and errors                | Parameterized SQL, escaped/bounded full-text input, plain-text snippets rendered by React, controlled public error messages                                                                               | Search/API tests; code review                                                            |

The recorded verification totals and commands are in the P11-09 work-log entry in [implementation status](implementation-status.md), the single task tracker.

## Trust and deployment constraints

- Complete first-run owner setup on a private connection before publishing the application. Initial setup intentionally has no existing owner credentials.
- Ordinary Nginx Proxy Manager provides HTTPS/routing. Keep local application authentication, enable secure cookies and preserve application headers. Proxy identity authentication is a separate explicit mode, not required for NPM.
- Back up content and consistent system state together: database, initialization marker and matching MFA key. Recovery has no unauthenticated reset or silent MFA bypass. A crash after persisting the marker but before account insertion requires offline recovery.
- Filesystem/host operators are trusted. Static unsafe links and replaced document-file links are rejected; protection does not claim atomic containment against an adversarial host concurrently swapping every directory, or deleting every initialization artifact. Existing legacy installations with all prior evidence already erased cannot be distinguished from fresh ones.
- MFA remains optional and passwords retain the 15-character minimum. TOTP requires synchronized clocks and is not phishing-resistant. Losing all factors and recovery codes requires operator recovery.
- CSP allows inline styles required by the UI/Mermaid and remote document images; scripts remain restricted. Remote images can disclose a reader's network address to their host.
- Large allowed uploads, buffered attachment downloads under the mutation lock (KI-8), per-request tree scans (KI-9), and cold-start database checks have availability costs. Phase 15 performance review must measure them; upstream request/body limits can supplement application limits.
- This review adds no service, proxy server, remote reset endpoint or production test bypass. Schema remains version 5. Further dependency and release audits remain required by the existing plan.

## References

- [ADR-0019: authentication recovery](adr/0019-fail-closed-authentication-recovery.md)
- [SQLite database header and recovery files](https://www.sqlite.org/fileformat.html)
- [SQLite quick integrity checking](https://www.sqlite.org/pragma.html#pragma_quick_check)
- [OWASP session management guidance](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
