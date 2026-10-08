# Security Policy

LeanDocs is pre-release software: development previews are published, and the first stable release (1.0) is being prepared. Two security reviews have been completed (authentication and rendering, then content handling, import and deployment). See [review findings and constraints](docs/security-review.md) and [implementation status](docs/implementation-status.md).

Complete administrator setup privately before public exposure. Ordinary Nginx Proxy Manager HTTPS routing uses `AUTH_MODE=local`, `SESSION_COOKIE_SECURE=true` and, optionally, a matching public HTTPS `PUBLIC_ORIGIN`. Preserve the application authentication and CSRF headers. Back up durable authentication alongside content; corrupt app data stops startup rather than reopening setup.

## Reporting a vulnerability

Please report vulnerabilities privately to the maintainer rather than in a public issue. A dedicated contact address will be published before the 1.0 release.

## Security principles

The baseline is in PROJECT_SPEC §52: path traversal prevention, sanitized Markdown/HTML/Mermaid rendering, CSRF protection, secure sessions, upload validation, CSP and security headers, login rate limiting, and no telemetry.
