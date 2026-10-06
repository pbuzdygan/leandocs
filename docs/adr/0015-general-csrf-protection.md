# ADR-0015: General CSRF protection

- **Status:** Accepted
- **Date:** 2026-10-04
- **Author:** @codex
- **Related:** PROJECT_SPEC §51, task P11-06; ADR-0010–0014

## Context

Content mutations and multipart uploads need protection against actions triggered by other
websites in every authentication mode. SameSite cookies alone do not cover proxy or none mode.
The owner's external Nginx Proxy Manager will terminate HTTPS while LeanDocs handles local login.

## Decision

Check every unsafe API method in the global onRequest hook, after authentication and before body
parsing. Require exactly one `X-LeanDocs-CSRF` header matching a 64-character hex nonce using
constant-time comparison. Never accept body/query tokens. Setup retains its existing separate
setup token and gains the same origin checks. Disabled local credential endpoints remain disabled.

GET `/auth/session` supplies the nonce: derived from the random local session token, or a random
process-local anonymous/proxy/none value. Proxy status exposes a usable token only after gateway
authorization. Anonymous tokens cannot authorize authenticated local mutations. Preserve no-store
responses and the absence of CORS; GET/HEAD/OPTIONS require no token.

Reject cross-site and same-site-but-different-origin Fetch Metadata. When supplied, Origin must
match exactly; otherwise validate Referer against the expected origin. Missing browser metadata
is permitted only with the valid custom-header token, supporting API scripts.

Optional `PUBLIC_ORIGIN` selects a canonical HTTP(S) origin and pins the API Host, including
status endpoints, to protect against alternate-host nonce retrieval/DNS rebinding. Exempt health
for internal probes. With no configured origin, derive it from Host and connection scheme, or
HTTPS when `SESSION_COOKIE_SECURE=true`. Never trust forwarded headers. NPM must preserve
the public Host. No proxy service or new dependency is introduced.

The browser API client obtains a fresh session nonce before each content mutation and preserves
explicit authentication/setup tokens. Leave multipart Content-Type to the browser. Report failures
without automatically replaying mutations.

This follows the custom-header, origin verification and Fetch Metadata strategies in the
[OWASP CSRF prevention guidance](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html).

## Alternatives considered

- SameSite cookies alone: insufficient for proxy/none modes and different-origin same-site cases.
- Body/query tokens: risk leakage and require parsing uploads before rejection.
- Trust forwarded origin/host headers: expands trust to client-controlled values.
- Cached frontend nonce with automatic write retry: stale after login/restart; retries risk duplicate actions.

## Consequences

Existing API scripts must fetch status and include the header for writes. Each browser content
mutation adds a small status request. Proxy/none process tokens rotate on restart; local tokens
rotate with the session. PUBLIC_ORIGIN is optional to preserve flexible development, but recommended
for a fixed public hostname. None mode remains anonymous full access; CSRF does not restrict direct
API callers. Headers/CSP, full throttling, local MFA and security review remain separate Phase 11 tasks.
