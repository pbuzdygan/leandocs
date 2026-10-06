# ADR-0017: Bounded local login rate limiting

- **Status:** Accepted
- **Date:** 2026-10-04
- **Author:** @codex
- **Related:** PROJECT_SPEC §49, §52, §79; P11-08; ADR-0011–0013

## Context

The preliminary limit allowed five local login attempts per direct peer in a fixed minute. Changing
IPs bypassed that limit, fixed-window boundaries allowed bursts, and every rejection reported a full
minute even when recovery was nearer. LeanDocs has one administrator and one server process. The
owner will use ordinary external Nginx Proxy Manager for HTTPS/routing while keeping local login.

## Decision

Use a rolling 60-second window with five admitted attempts per direct socket IP and ten across all
IPs for the singleton local account. Reserve before querying/verifying credentials, including successes,
unknown usernames and requests rejected by the existing single in-flight password-work gate.
Do not reset on success, change the key with the submitted username, or queue password hashes.
CSRF, body size, JSON and schema checks precede admission; invalid requests that cannot perform
password verification do not consume this budget.

Use monotonic process time. Canonicalize IPv6 and IPv4-mapped IPv6 peer spellings; scoped socket
addresses drop the scope for a conservative shared address limit. Missing/invalid addresses share one
unknown bucket. Never key by forwarded headers, identity claims or browser cookies/CSRF tokens.

Only admitted attempts allocate state. The aggregate budget bounds active peer entries and total
admitted timestamps to ten; expired entries are pruned on requests. Rejections do not allocate keys,
evict active penalties, or extend the window. No cleanup timer, persistent lockout, service or dependency
is needed. Constants in `auth/rate-limit.ts` define the reviewed policy; no environment switch can
disable limits. Restart resets process-local limits, consistent with the single-container design.

Respond with 429 LOGIN_RATE_LIMIT, a remaining-wait message, matching retryAfterSeconds details
and integer Retry-After rounded up to 1–60 seconds. Concurrent password work returns LOGIN_BUSY
and a one-second retry. Neither response issues a cookie or invalidates existing sessions. Retain generic
credential failure messages, no-store and security headers. The browser reports the wait, clears the
password and does not replay the submission automatically.

For local auth behind NPM all requests share its direct peer allowance, regardless of forwarded IPs.
This is appropriate for one administrator and prevents forged-address bypass without adding proxy
trust. No NPM authentication or proxy_auth setting is required. In AUTH_MODE=proxy the external
gateway owns login throttling and MFA; local credential endpoints remain disabled. None mode also
has no local credential endpoint. Do not throttle ordinary authorized content by a login budget.

For P11-11, share the local aggregate/peer limiter with second-factor and recovery-code attempts,
including enrollment confirmation and disabling MFA with reauthentication. Add a bounded five-attempt
limit per server-issued challenge with expiry; replacing a challenge must not reset the shared account
budget. Test replay, concurrent verification, challenge replacement, expiry, recovery-code failures and
continued access for existing sessions. No MFA route or dummy challenge is introduced in P11-08.

This follows [OWASP authentication guidance](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
on account-aware throttling, generic failures and lockout denial-of-service tradeoffs.

## Alternatives considered

- Submitted username buckets: aliases/case/unknown names bypass the singleton account limit.
- Direct-peer-only or trusted forwarded IP limits: distributed attempts bypass the first; the second
  requires a new trust boundary not needed for the owner's ordinary NPM deployment.
- Fixed windows: permit a burst around reset boundaries and give imprecise retry advice.
- Persistent/exponential account lockout: can prevent the owner signing in long after a short attack.
- Unbounded peer maps or eviction of active peers: risk resource exhaustion or reset attacker penalties.

## Consequences

Repeated sign-ins may temporarily block even a correct password. Active sessions, health and normal
content remain usable. Continuous attacks can still disrupt new sign-ins; this limiter bounds password
work rather than providing network-level denial-of-service protection. No counters or submitted secrets
are logged. MFA and the final Phase 11 review remain pending.
