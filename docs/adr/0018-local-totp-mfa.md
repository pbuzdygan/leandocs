# ADR-0018: Optional local TOTP MFA

- **Status:** Accepted
- **Date:** 2026-10-04
- **Author:** @codex
- **Related:** PROJECT_SPEC §49/52; P11-11; ADR-0011–0017

## Context

The owner authorized optional local MFA before public local-auth release and expects compatibility
with Microsoft Authenticator. Password/session/CSRF/throttling foundations are complete. Existing
password-length discussion was informational; the 15-character minimum remains unchanged.

## Decision

Use pinned OTPAuth 9.5.2 for RFC 6238 TOTP and qrcode 1.5.4 for locally generated PNG QR data URLs.
SHA1, six digits, 30 seconds, a random 20-byte secret and a ±1-step clock window are compatible with
standard authenticator applications. No runtime CDN, Microsoft connection or proprietary algorithm.
Persist the last accepted step and consume only strictly newer codes in transactions, including
confirmation, login and disablement. Recovery codes contain 128 random bits, are stored only as
SHA-256 digests and are deleted transactionally on use; ten codes are shown once on enrollment.

Migration 5 appends singleton MFA configuration and recovery-code tables to existing auth app data,
never canonical documentation or rebuildable index tables. Encrypt the TOTP secret with Node
AES-256-GCM, random 12-byte IV, versioned authenticated context and a 32-byte key file at
DATA_DIR/system/mfa.key (exclusive creation, mode 0600, no symlinks). Back up this file with app.db.
Fail closed if active MFA cannot be decrypted or its key is missing/invalid; never silently reset MFA.
This protects a database-only leak; filesystem access to both files is outside that protection.

Enrollment and disablement require an authenticated local session, CSRF and password verification;
disabling also requires a current TOTP or unused recovery code. Enrollment expires after five minutes,
is bound to its session and needs a valid code before activation. Cancellation deletes its pending
server secret; replacement supersedes the previous enrollment. Enabling/disabling revokes other
sessions and rotates the current one; outstanding login/enrollment challenges are invalidated.

Correct passwords on MFA accounts issue only a bounded, five-minute, random-token challenge:
no full session/cookie and no document access. Keep challenge digests in memory, bound to the
anonymous/current-session CSRF value, with five attempts each and at most ten active challenges.
Check account password/config state again on completion; changes/logout/restart invalidate state.
Every password/factor/recovery/confirmation attempt shares the rolling account/peer limiter;
replacing challenges cannot reset that budget. Factor acceptance and session issuance are atomic.

Settings › Security offers enrollment QR/manual key, confirmation, recovery-code acknowledgment
and reauthenticated disablement. Login offers authenticator or recovery code after password success,
with cancellation and expiry handling. Temporary secrets/passwords/codes stay in component memory,
are cleared on transitions and are never placed in caches, storage, URLs or logs. Proxy/none modes
cannot use these local endpoints; gateway MFA remains external. Existing CSRF/CSP remain intact.

## Alternatives considered

- Implement OTP cryptography ourselves: avoidable with the maintained RFC implementation.
- Plaintext SQLite secrets: expose both factors to a database-only leak.
- External identity server: violates deployment simplicity and is unnecessary for local TOTP.
- Issue a normal session after password only: would grant access before the second factor.
- Persistent challenges: unnecessary transient state; restart should invalidate them.

## Consequences

Backups must retain both auth database and key. Lost authenticator access uses one-use recovery codes;
losing all factors has no unauthenticated bypass. TOTP is not phishing-resistant. Server/phone clocks
must be synchronized. The feature remains opt-in, and Phase 11 security review follows implementation.

References: [OTPAuth](https://github.com/hectorm/otpauth),
[qrcode](https://github.com/soldair/node-qrcode), [RFC 6238](https://www.rfc-editor.org/rfc/rfc6238).
