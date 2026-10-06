# ADR-0016: Security headers and Content Security Policy

- **Status:** Accepted
- **Date:** 2026-10-04
- **Author:** @codex
- **Related:** PROJECT_SPEC §52–53, §79; task P11-07; ADR-0008, ADR-0015

## Context

The production server serves the application, API, static assets and user attachments. These
responses need browser protections without breaking strict Mermaid rendering or either editor.
HTTPS may terminate at the owner's external Nginx Proxy Manager. Development still uses HTTP.

## Decision

Apply headers in a global Fastify onSend hook, registered before routes. Cover successful responses,
HEAD, SPA fallback, authentication/CSRF/validation errors and unknown routes without altering bodies.
Preserve existing attachment CSP, including SVG sandbox and script-src none; never replace it with
the application's script allowance.

The application policy uses default-src none, script-src self and script-src-attr none. No inline,
eval, data or blob script exception is added. Styles allow self and unsafe-inline because Mermaid
SVG style blocks and React/Radix/CodeMirror dynamic styles require it. Existing Markdown sanitization
and Mermaid strict security mode remain unchanged; inline styles in user HTML stay sanitized.

Allow same-origin connections and the manifest. Bundled fonts allow self and data URLs because
Vite embeds small font subsets; external font hosts remain blocked. Images retain self, data, HTTP and
HTTPS compatibility for authored Markdown images; this does not allow remote scripts or connections.
Deny frames, framing by other pages, objects, workers and base elements; restrict form submission
to the same origin. There is no report-only period or remote CSP reporting service.

Always emit nosniff, X-Frame-Options DENY, Referrer-Policy no-referrer,
Cross-Origin-Resource-Policy same-origin, and Permissions-Policy disabling camera, microphone and
geolocation. Clipboard functionality is retained.

Emit Strict-Transport-Security max-age=31536000 only for an actual TLS connection or explicit
SESSION_COOKIE_SECURE=true, which already identifies an HTTPS proxy deployment. Ignore forwarded
scheme headers. Do not add includeSubDomains or preload: unrelated hosts are the owner's responsibility.
Do not force upgrade-insecure-requests in HTTP development. NPM should pass the application headers
through and redirect HTTP to HTTPS; an additional CSP is enforced alongside ours and can break the UI.
No proxy service, configuration toggle, dependency or schema migration is added.

References: [W3C CSP](https://www.w3.org/TR/CSP/),
[OWASP HTTP headers guidance](https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet.html),
[Fastify response hook](https://fastify.dev/docs/latest/Reference/Hooks/#onsend).

## Alternatives considered

- Add a security-header dependency: a small explicit hook meets the current scope without another package.
- Apply headers only at NPM: leaves direct deployments and error responses unprotected.
- Relax script policy for Mermaid: unnecessary; only inline styles are required.
- Replace attachment CSP globally: would weaken the existing SVG sandbox.
- Enable HSTS unconditionally or trust forwarded protocol: would affect HTTP development or accept forged metadata.

## Consequences

The application cannot be embedded in another page. Injected scripts, event handlers, foreign
connections/forms/frames are blocked by the browser even if they reach the DOM. Authored external
images still contact their chosen hosts, without a referrer; on HTTPS, browser mixed-content rules
apply to HTTP images. CSP is defense in depth and does not replace authentication, CSRF or sanitization.
Vite development serves its own HTML/HMR and is not covered by the production HTML policy; browser
verification uses the real production server. Full throttling, local MFA and review remain Phase 11 tasks.
