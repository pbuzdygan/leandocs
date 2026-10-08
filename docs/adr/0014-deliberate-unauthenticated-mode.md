# ADR-0014: Deliberate unauthenticated mode

- **Status:** Accepted
- **Date:** 2026-10-04
- **Author:** @codex
- **Related:** PROJECT_SPEC §48, §51–52; P11-05; ADR-0012/0013

## Context

The specification permits explicitly disabling login for a private installation and requires
an unmistakable warning in Settings. The owner's planned public Nginx Proxy Manager deployment
keeps local authentication. This task implements the optional mode without changing that plan.

## Decision

- Accept `AUTH_MODE=none` only as an explicit environment value. Missing/empty configuration
  still selects local authentication; unknown values stop startup. There is no UI toggle or
  automatic fallback from a failed local/proxy login.
- Bypass only the API authentication requirement. Preserve path safety, validation, upload
  limits, rendering sanitization, revision conflicts and all other content protections.
  Anyone who can reach the installation can read, edit and delete documents.
- Session status returns `authMode: none`, `user: null` and a process-local CSRF token for the
  forthcoming P11-06 work. Do not fabricate a user, trust identity headers, mint cookies or
  create accounts/sessions. No DB migration or extra dependency is needed.
- Setup status reports complete without an account or setup token. Disable setup/login/logout
  POSTs before parsing, returning `AUTH_DISABLED`. Preserve existing local credentials and
  sessions so selecting local mode again restores the previous account and normal access checks.
- UI gates admit the explicit none mode, `/login` opens documentation, and `/setup` explains
  the disabled authentication. No account menu/login/logout controls are shown.
- Every Settings section displays a persistent accessible warning: anyone with network access
  can read, edit and delete documentation; authentication should be enabled before public access.
  Startup logs also warn. Settings does not expose deployment configuration controls.

## Alternatives considered

- **Disable auth when credentials/configuration are missing:** rejected; defaults must fail closed.
- **Create an anonymous administrator/session:** rejected; none mode has no authenticated identity.
- **Enable via Settings:** rejected; the spec requires deliberate deployment configuration.
- **Make anonymous access read-only:** outside this task; no roles/public-sharing feature is added.

## Consequences

Private installations may deliberately omit login. Nginx Proxy Manager providing HTTPS does
not make none mode appropriate for the owner's public deployment: use local auth and secure
cookies there. General CSRF must cover none mode too (P11-06); security headers, complete
throttling, local MFA and review remain pending. No owner runtime configuration/deployment is
changed by implementing this optional mode.
