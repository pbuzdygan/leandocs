import { timingSafeEqual } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import type { AppConfig } from '../config/config.js';
import { AppError } from '../errors.js';

export const unsafeMethod = (method: string) => !['GET', 'HEAD', 'OPTIONS'].includes(method);
const denied = () =>
  new AppError(403, 'CROSS_SITE_REQUEST', 'Submit requests from this application.');

/** PUBLIC_ORIGIN pins the host too, preventing alternate hosts from reading a valid nonce. */
export function checkCsrfOrigin(
  request: FastifyRequest,
  config: AppConfig,
  mutation: boolean,
): void {
  const host = request.headers.host;
  let target: URL;
  try {
    target = new URL(`${config.sessionCookieSecure ? 'https' : request.protocol}://${host}`);
    if (!host || /[\s\\/@?#]/.test(host) || target.username || target.password) throw new Error();
  } catch {
    throw denied();
  }
  if (config.publicOrigin && target.host !== new URL(config.publicOrigin).host) throw denied();
  if (!mutation) return;
  const site = request.headers['sec-fetch-site'];
  if (site !== undefined && site !== 'same-origin' && site !== 'none') throw denied();
  const origin = request.headers.origin;
  const referer = request.headers.referer;
  const expected = config.publicOrigin ?? target.origin;
  if (origin !== undefined) {
    if (typeof origin !== 'string' || origin !== expected) throw denied();
  } else if (referer !== undefined) {
    try {
      if (typeof referer !== 'string') throw new Error();
      const url = new URL(referer);
      if (url.origin !== expected || url.username || url.password) throw new Error();
    } catch {
      throw denied();
    }
  }
}

/** One custom header, exact hex encoding and constant-time comparison; never accept body/query tokens. */
export function checkCsrfToken(request: FastifyRequest, expected: string): void {
  const token = request.headers['x-leandocs-csrf'];
  let count = 0;
  for (let i = 0; i < request.raw.rawHeaders.length; i += 2)
    if (request.raw.rawHeaders[i]!.toLowerCase() === 'x-leandocs-csrf') count++;
  if (
    count !== 1 ||
    typeof token !== 'string' ||
    token.length !== 64 ||
    !/^[0-9a-f]{64}$/.test(token) ||
    expected.length !== 64 ||
    !timingSafeEqual(Buffer.from(token), Buffer.from(expected))
  )
    throw new AppError(403, 'INVALID_CSRF_TOKEN', 'Reload the page and try again.');
}
