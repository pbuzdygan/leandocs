# ADR-0013: Trusted proxy authentication

- **Status:** Accepted
- **Date:** 2026-10-04
- **Author:** @codex
- **Related:** PROJECT_SPEC §48, §50–52; P11-04; ADR-0012

## Context

Proxy authentication must accept an identity from an external gateway without trusting headers
from public clients. Version 1.0 remains single-user. The owner plans to use their own Nginx
Proxy Manager. An ordinary HTTPS reverse proxy does not replace application authentication.

## Decision

- Keep `AUTH_MODE=local` as the default. Nginx Proxy Manager can provide HTTPS/routing while
  LeanDocs provides local login; set `SESSION_COOKIE_SECURE=true` for this deployment.
  This task adds no proxy server, gateway dependency or extra runtime service.
- Opt-in `AUTH_MODE=proxy` requires all three settings: `PROXY_TRUSTED_IPS` (1–32 exact IPv4/IPv6
  addresses), `PROXY_AUTH_HEADER` (a dedicated `x-` header or `remote-user`) and `PROXY_AUTH_USER`
  (one exact ASCII identity, including email-style identities). Reject missing or malformed
  configuration at startup. Hostnames, CIDR/wildcards, zone identifiers and forwarded/LeanDocs
  header names are unsupported. `AUTH_MODE=none` remains P11-05 and currently fails startup.
- Compare the direct socket peer against the IP allowlist using Node `BlockList`; IPv4-mapped
  IPv6 and equivalent IPv6 spellings are supported. Keep Fastify `trustProxy` disabled.
  Never infer trust from `Forwarded`, `X-Forwarded-For`, scheme headers or a local session cookie.
- Require exactly one identity header and an exact match to the configured single user on
  every protected API request. Reject absent, repeated, joined or other-user values. The gateway
  must authenticate/authorize that user and overwrite client-supplied identity headers, and
  network rules must prevent public access to the backend around the gateway.
- Proxy requests create no local account or session cookie. Session status reports `authMode`,
  the authorized user or null and a process-local CSRF token only for an authorized request.
  General proxy/content CSRF enforcement remains P11-06.
- Proxy setup status is complete without an account/token. Disable local setup/login/logout
  POST endpoints before parsing/validation. Existing credentials/sessions remain in the DB
  so returning to local mode preserves them; they have no authority in proxy mode.
- The UI skips account creation, opens requested documents for authorized identities, and
  explains gateway-managed authentication when access is missing. It does not offer local
  password entry or application logout in proxy mode; gateway login/logout/MFA are managed
  externally. No arbitrary redirect/logout URL is accepted from environment or headers.

## Alternatives considered

- **Trust every forwarded user:** rejected; headers from public clients cannot prove identity.
- **Accept any gateway user:** rejected; this would silently introduce multi-user access.
- **Mint local sessions from a gateway identity:** rejected; those cookies could outlive gateway
  revocation. Checking every request keeps authorization with the gateway.
- **Build an embedded proxy:** unnecessary; the owner supplies the external proxy/gateway.
- **Trust whole networks:** deferred; exact peer addresses keep the supported trust boundary small.

## Consequences

The selected gateway controls authentication, authorization and MFA. Changing/removing the
identity on a request immediately removes its access; local cookies cannot bypass the gateway.
Operators must update the explicit peer IP if the gateway address changes. Ordinary Nginx
Proxy Manager routing should keep local auth; selecting proxy mode requires an authenticated
identity integration. Remaining Phase 11 hardening and local MFA are still pending. No DB
migration, new dependency, owner preview deployment or extra runtime service is introduced.

References checked on 2026-10-04:

- [Fastify trustProxy](https://fastify.dev/docs/latest/Reference/Server/#trustproxy)
- [Node BlockList](https://nodejs.org/api/net.html#class-netblocklist) (`addAddress`/`check`, available since Node 14)

## Amendment (2026-10-04, P11-05)

The temporary startup rejection of `AUTH_MODE=none` is superseded by
[ADR-0014](0014-deliberate-unauthenticated-mode.md). Explicit none mode is now supported;
all proxy-mode trust and identity checks remain unchanged.
