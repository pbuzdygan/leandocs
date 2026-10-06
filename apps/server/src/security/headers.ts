import type { FastifyInstance } from 'fastify';
import type { AppConfig } from '../config/config.js';

// Mermaid SVG style blocks and React/Radix/CodeMirror styles require inline CSS.
// Scripts remain bundled, same-origin and free of inline/eval exceptions.
export const APP_CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "script-src-attr 'none'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: http: https:",
  // Vite embeds small bundled font subsets as data URLs.
  "font-src 'self' data:",
  "connect-src 'self'",
  "manifest-src 'self'",
  "base-uri 'none'",
  "object-src 'none'",
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "worker-src 'none'",
].join('; ');

/** Runs for static files, API responses and errors; retain stricter attachment policies. */
export function registerSecurityHeaders(app: FastifyInstance, config: AppConfig): void {
  app.addHook('onSend', async (request, reply, payload) => {
    if (!reply.hasHeader('Content-Security-Policy'))
      reply.header('Content-Security-Policy', APP_CSP);
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    reply.header('Cross-Origin-Resource-Policy', 'same-origin');
    // HTTPS may terminate at NPM; only the explicit flag or TLS connection is trusted.
    // Do not includeSubDomains/preload: the owner controls unrelated domains separately.
    if (config.sessionCookieSecure || request.protocol === 'https')
      reply.header('Strict-Transport-Security', 'max-age=31536000');
    return payload;
  });
}
