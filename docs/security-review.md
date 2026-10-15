# Security reviews

## Third pass

**Date:** 2026-10-15 · **Reviewer:** @claude-code · **Base:** `4811884` (end of P15-02) to `acfa836` · **Scope:** changes since the second pass (change password, attachments added outside the app (KI-7), app settings API, theme-aware Mermaid and task-list labels, Node.js 26, digest-pinned images, dependency updates) and a repository-wide check against the security baseline in `.ai/SECURITY.md`: secrets in the working tree and Git history, CI/CD, container and Compose configuration, GitHub repository settings.

This is an implementation and configuration review with the existing regression tests, not an external penetration test. Authentication, CSRF, headers and rendering controls from earlier reviews were re-checked only where the changes touch them.

### Evidence checklist

| Control                               | Status         | Evidence                                                                                                                                                                                                                                                                  |
| ------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Trust boundaries and protected assets | verified       | New entry points: `POST /auth/password`, `GET`/`PATCH /settings`, reads and deletion of attachment names not created by the app. Assets: owner account and sessions, documentation folder.                                                                                |
| Authentication and authorization      | verified       | The global route guard covers the new routes; `api/auth.test.ts` and `api/csrf.test.ts` enumerate every registered route. Changing the password needs a session, the CSRF token and the current password, shares the sign-in attempt budget and ends every other session. |
| Ownership and cross-tenant denial     | not applicable | One owner account; no tenants or shared objects.                                                                                                                                                                                                                          |
| Input validation and limits           | verified       | Settings schema rejects unknown fields and accepts only listed values (`api/settings.test.ts`); password routes have an 8 KiB body limit and 1,024-character fields; existing attachment names must be one plain segment of at most 255 bytes with an allowed extension.  |
| Queries and filesystem paths          | verified       | The password update is parameterized and conditional on the old hash. `newDocumentFolder` passes `normalizeRelativePath`, the hidden-path check and `resolveExistingDirectory`. Attachments open with `O_NOFOLLOW`; traversal, hidden and executable names are rejected.  |
| Browser output                        | verified       | Mermaid stays in `strict` mode with theme values taken from the app's own CSS tokens; task-list labels are set as hast properties after sanitizing and rendered by React. Browser tests: rendering and CSP (`e2e/security-headers.spec.ts`).                              |
| Secrets                               | verified       | gitleaks over all 67 commits and the working tree: two hits, both the public RFC 6238 test secret in tests. No `.env` or `data/` tracked; no tracked file matches `.gitignore`.                                                                                           |
| Outbound requests                     | not applicable | The server makes no outbound network requests.                                                                                                                                                                                                                            |
| Errors and logs                       | verified       | Error handler unchanged: 5xx responses carry no details. New errors return fixed messages.                                                                                                                                                                                |
| Dependencies and build                | verified       | `pnpm audit --audit-level=low`: no known vulnerabilities. New or updated: `mermaid` 12.2.0 (browser), `tsup` 9 and `@axe-core/playwright` (development only). CI actions pinned by commit; base images pinned by digest with Dependabot updates.                          |
| Container and deployment privileges   | finding        | Image and Compose are minimal (distroless, non-root, read-only, all capabilities dropped, `no-new-privileges`). Open items 1 and 3 below.                                                                                                                                 |
| Security tests and scanners           | verified       | Node.js 26.11.1: format, lint, typecheck, 726 unit and API tests, build; 81 browser tests in Chromium in the Playwright image. Firefox and WebKit were not run locally.                                                                                                   |
| Remaining risk and unavailable checks | recorded       | Open items and not verified below.                                                                                                                                                                                                                                        |

### Open items

These are configuration and policy items, not exploitable defects in the reviewed code; they are tracked for owner decisions.

1. **First-run exposure.** Before the first account exists, anyone who reaches the application can create it (ADR-0010). The Compose files listen on all host addresses over HTTP by default, so a fresh deployment on a reachable host is exposed until setup completes. The setup status also returns the resolved content folder. Options: bind to `127.0.0.1` by default, or deliver the setup token out of band (logs) instead of through the API; either needs an ADR.
2. **`main` is not protected.** The release workflow publishes `:latest` from `main`, which is expected to change only through pull requests. Branch protection with required CI checks would enforce that.
3. **No container resource limits.** Compose sets no memory or process limits; the analysis child process bounds parsing, but the server process itself is unbounded.
4. **Supply chain hardening.** The Playwright CI image is pinned by tag, not digest; pnpm has no minimum release age for new versions; released images carry no SBOM or signature.
5. **Personal infrastructure names in history.** Earlier fixtures used real host names, hardware and a private address; they were renamed. No credentials were included; history is not rewritten.

### Not verified

- GitHub secret scanning, push protection and Dependabot alert settings (needs an authenticated session).
- Browser tests in Firefox and WebKit (CI runs them for pull requests and `main`).
- Upgrade and backup checks were not repeated; they passed in the 0.2.0 release workflow. The performance check was not run.

## Second pass (P15-02)

**Date:** 2026-10-07 · **Reviewer:** @claude-code · **Task:** P15-02 · **Scope:** everything added after P11-09 (content watcher and change events, import pipeline, deployment image, release workflow, version reporting) and the cost of handling untrusted content on the server's single JavaScript thread. Areas reviewed in P11-09 (authentication, sessions, MFA, CSRF, headers, attachments, rendering) have had no security-relevant changes since; their route guard and headers were re-read.

This is an implementation review with regression tests and measurements, not an external penetration test.

### Findings and corrections

| Finding                                                        | Effect and correction                                                                                                                                                                                                                                                                                                                                                                                                          | Evidence                                                                                                                      |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| A: quadratic Markdown parsing of block containers              | Every closed quote or list item made micromark rebuild the whole event list: 400 KiB of short quotes took 106 s, and a realistic 5 MiB document exhausted the heap, which stops the server. Patched `micromark-util-edit-map` (identical output, tail-only cost; upstream is at its latest version).                                                                                                                           | `markdown/performance.test.ts` (fails without the patch); `patches/`                                                          |
| B: unbounded parsing of untrusted content on the server thread | Crafted Markdown (runs of `*` or `[`, deep nesting) and large HTML imports blocked all requests for seconds to minutes; running out of memory killed the server; deep nesting made a document "unreadable" so it vanished from the library; a deeply nested HTML file failed the whole import. Parsing now runs in a child process with time and memory limits; such documents are read as plain text and reported (ADR-0025). | `markdown/process-analyser.test.ts`, `api/analysis-limits.test.ts`, `api/import.test.ts`, web `documents/plain-text.test.tsx` |
| C: backtracking and repeated work on long text                 | The heading-title pattern (40 KiB line: 4.5 s, run for every document), the folded-word search pattern (long words such as hex dumps), trailing-character trimming of names and paths, unclosed tags in HTML blocks and the 200-byte name truncation (reachable through import file names) were quadratic. Rewritten in linear time with identical results.                                                                    | `text.test.ts` (hangs on the old code)                                                                                        |
| D: quadratic search snippets                                   | FTS5 `snippet()` (and `highlight()`) are quadratic in the matches inside one document: a search over one 2 MiB document took 22 s and blocked the server. Snippets are now built in linear time from a bounded prefix, for returned results only.                                                                                                                                                                              | `search/snippet.test.ts`, `api/analysis-limits.test.ts`                                                                       |
| E: checkout credentials in workflows                           | `actions/checkout` left the job token in `.git/config` for later steps. The Docker context already excludes `.git`; credentials are no longer persisted (defence in depth).                                                                                                                                                                                                                                                    | `.github/workflows/`                                                                                                          |

### Reviewed without findings

| Surface                      | Controls reviewed                                                                                                                                                                                                                                                                                       |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| External change events (SSE) | Not a public route; origin check on connect; authorization re-checked before every event and heartbeat; bounded clients, buffer and connection lifetime; refetch instead of replaying content                                                                                                           |
| Content watcher              | Does not follow symbolic links; events only trigger the same validated refresh as other changes                                                                                                                                                                                                         |
| Import                       | Paths normalised and validated; hidden entries and attachment folders skipped; reserved top-level folders refused; never overwrites (`link`/`wx` creation); attachments pass the upload validation; HTML is parsed and never rendered or executed, with active URLs removed; memory per request bounded |
| Route guard and headers      | Canonical route (not the raw URL) decides authentication; CSP and security headers unchanged                                                                                                                                                                                                            |
| Deployment image             | Distroless, non-root, read-only root filesystem, no shell; `.git`, `.env` and data excluded from the build context                                                                                                                                                                                      |
| Release workflow             | Runs only on releases published by the owner; tag, version and branch verified; packages permission only in the publishing job; actions pinned by commit; user-controlled values reach the shell only through environment variables; published versions are never overwritten                           |
| Version reporting            | Health shows only name and version; no build paths or secrets                                                                                                                                                                                                                                           |

### Remaining constraints

- Documents beyond the limits lose link tracking and formatted display until they are simplified; Settings › Index lists them.
- Each problematic file adds up to 20 seconds to startup or the refresh that reads it.
- Search `path:` filters and other short inputs keep simple patterns because their length is bounded (queries: 500 characters).
- The browser still parses ordinary large documents to display them; the server flags only those beyond the limits.

## Phase 11 review

**Date:** 2026-10-04 · **Reviewer:** @codex · **Task:** P11-09 · **Scope:** PROJECT_SPEC §52 and completed local MFA.

This is an implementation review with regression tests, not an external penetration test or release certification. Production deployment and the broader dependency, performance, upgrade and browser audits remain in Phases 14–15. No owner data, environment or running preview was changed.

### Findings and corrections

| Finding                                            | Effect and correction                                                                                                                                                                                                                                       | Evidence                                                     |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| KI-11: automatic replacement of corrupt SQLite     | Discarded accounts/MFA and reopened setup. Startup now refuses invalid databases without replacement. A private durable initialization marker also prevents missing/reset databases from reopening setup. Matching backups recover existing authentication. | `api/auth-recovery.test.ts`, `db/database.test.ts`; ADR-0019 |
| Templates followed filesystem links                | A linked template/root could read outside content. Validate the root with the existing contained-directory resolver and use no-follow regular-file reads.                                                                                                   | `templates/security.test.ts`, `api/templates.test.ts`        |
| Trash trusted root, metadata and restore ancestors | A linked root/item/metadata/payload or restore parent could read/write outside content. Validate each path before access; create destinations with the existing safe directory helper.                                                                      | `trash/security.test.ts`, `api/lifecycle.test.ts`            |
| Cached document reads followed replaced file links | A previously indexed file replaced with a symlink could expose outside content before refresh. Validate its parent and use no-follow regular-file opens.                                                                                                    | `api/documents.test.ts` covers read, raw download and save   |

Authentication recovery deliberately changes the old corrupt-database and critical-test-B expectations. Those tests now verify preserved evidence and index rebuilding without discarding accounts. Fresh isolated index tests retain the filesystem-portability guarantee. No failing test was skipped or removed.

### Reviewed surfaces

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

The recorded verification totals and commands are in the P11-09 work-log entry of the retired task board (Git history: `git show 2f34c27:docs/implementation-status.md`).

### Trust and deployment constraints

- Complete first-run owner setup on a private connection before publishing the application. Initial setup intentionally has no existing owner credentials.
- Ordinary Nginx Proxy Manager provides HTTPS/routing. Keep local application authentication, enable secure cookies and preserve application headers. Proxy identity authentication is a separate explicit mode, not required for NPM.
- Back up content and consistent system state together: database, initialization marker and matching MFA key. Recovery has no unauthenticated reset or silent MFA bypass. A crash after persisting the marker but before account insertion requires offline recovery.
- Filesystem/host operators are trusted. Static unsafe links and replaced document-file links are rejected; protection does not claim atomic containment against an adversarial host concurrently swapping every directory, or deleting every initialization artifact. Existing legacy installations with all prior evidence already erased cannot be distinguished from fresh ones.
- MFA remains optional and passwords retain the 15-character minimum. TOTP requires synchronized clocks and is not phishing-resistant. Losing all factors and recovery codes requires operator recovery.
- CSP allows inline styles required by the UI/Mermaid and remote document images; scripts remain restricted. Remote images can disclose a reader's network address to their host.
- Large allowed uploads, buffered attachment downloads under the mutation lock (KI-8), per-request tree scans (KI-9), and cold-start database checks have availability costs. Phase 15 performance review must measure them; upstream request/body limits can supplement application limits.
- This review adds no service, proxy server, remote reset endpoint or production test bypass. Schema remains version 5. Further dependency and release audits remain required by the existing plan.

### References

- [ADR-0019: authentication recovery](adr/0019-fail-closed-authentication-recovery.md)
- [SQLite database header and recovery files](https://www.sqlite.org/fileformat.html)
- [SQLite quick integrity checking](https://www.sqlite.org/pragma.html#pragma_quick_check)
- [OWASP session management guidance](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
