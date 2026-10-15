# Security Policy

LeanDocs 0.2.0 is the first stable release; development previews (`devX.Y.Z`) are published from the `dev` branch. Two security reviews have been completed (authentication and rendering, then content handling, import and deployment). See [review findings and constraints](docs/security-review.md) and [known issues](docs/decisions.md#known-issues).

Complete administrator setup privately before public exposure. Ordinary Nginx Proxy Manager HTTPS routing uses `AUTH_MODE=local`, `SESSION_COOKIE_SECURE=true` and, optionally, a matching public HTTPS `PUBLIC_ORIGIN`. Preserve the application authentication and CSRF headers. Back up durable authentication alongside content; corrupt app data stops startup rather than reopening setup.

## Reporting a vulnerability

Please report vulnerabilities privately, not in a public issue: use [GitHub's private vulnerability reporting](https://github.com/pbuzdygan/leandocs/security/advisories/new) (repository › Security › Report a vulnerability). Include the affected version, steps to reproduce and the impact you observed.

## Security principles

The baseline is in PROJECT_SPEC §52: path traversal prevention, sanitized Markdown/HTML/Mermaid rendering, CSRF protection, secure sessions, upload validation, CSP and security headers, login rate limiting, and no telemetry.
