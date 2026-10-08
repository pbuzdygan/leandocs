import path from 'node:path';
import { isIP } from 'node:net';

export type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';

export interface AppConfig {
  authMode: 'local' | 'proxy' | 'none';
  proxyAuth: { trustedIps: string[]; header: string; username: string } | undefined;
  /** Set true behind an HTTPS reverse proxy; untrusted forwarded headers never set this. */
  sessionCookieSecure: boolean;
  /** Optional canonical browser origin, especially behind HTTPS termination. */
  publicOrigin: string | undefined;
  /** Maximum attachment size in bytes (default 50 MiB). */
  maxUploadSize: number;
  port: number;
  host: string;
  /** Root data directory. Documents live in `<dataDir>/content`, SQLite in `<dataDir>/system`. */
  dataDir: string;
  logLevel: LogLevel;
  /** Built web app to serve as static files; undefined disables static serving (dev). */
  webDistDir: string | undefined;
  /** D-10: write a UUID into documents that have none (only missing fields are added). */
  assignMissingIds: boolean;
  /** P12-01: how external file changes are detected; `off` relies on per-request scans only. */
  watchMode: 'native' | 'poll' | 'off';
}

const LOG_LEVELS: readonly LogLevel[] = [
  'fatal',
  'error',
  'warn',
  'info',
  'debug',
  'trace',
  'silent',
];

export class ConfigError extends Error {}

function parsePort(raw: string | undefined): number {
  if (raw === undefined || raw === '') return 8080;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new ConfigError(`Invalid PORT: ${raw}`);
  }
  return port;
}

function parseLogLevel(raw: string | undefined): LogLevel {
  if (raw === undefined || raw === '') return 'info';
  if (!(LOG_LEVELS as readonly string[]).includes(raw)) {
    throw new ConfigError(`Invalid LOG_LEVEL: ${raw} (expected one of ${LOG_LEVELS.join(', ')})`);
  }
  return raw as LogLevel;
}

function parseBoolean(name: string, raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined || raw === '') return fallback;
  if (['true', '1', 'yes'].includes(raw.toLowerCase())) return true;
  if (['false', '0', 'no'].includes(raw.toLowerCase())) return false;
  throw new ConfigError(`Invalid ${name}: ${raw} (expected true or false)`);
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const authMode = env.AUTH_MODE || 'local';
  if (authMode !== 'local' && authMode !== 'proxy' && authMode !== 'none')
    throw new ConfigError('Invalid AUTH_MODE (expected local, proxy or none)');
  return {
    authMode,
    publicOrigin: parsePublicOrigin(env.PUBLIC_ORIGIN),
    proxyAuth: authMode === 'proxy' ? parseProxyAuth(env) : undefined,
    sessionCookieSecure: parseBoolean('SESSION_COOKIE_SECURE', env.SESSION_COOKIE_SECURE, false),
    maxUploadSize: parseUploadSize(env.MAX_UPLOAD_SIZE),
    port: parsePort(env.PORT),
    host: env.HOST || '0.0.0.0',
    dataDir: path.resolve(env.DATA_DIR || './data'),
    logLevel: parseLogLevel(env.LOG_LEVEL),
    webDistDir: env.WEB_DIST_DIR ? path.resolve(env.WEB_DIST_DIR) : undefined,
    assignMissingIds: parseBoolean('ASSIGN_MISSING_IDS', env.ASSIGN_MISSING_IDS, true),
    watchMode: parseWatchMode(env.WATCH_MODE),
  };
}

function parseWatchMode(raw: string | undefined): AppConfig['watchMode'] {
  if (raw === undefined || raw === '') return 'native';
  if (raw === 'native' || raw === 'poll' || raw === 'off') return raw;
  throw new ConfigError(`Invalid WATCH_MODE: ${raw} (expected native, poll or off)`);
}

function parseProxyAuth(env: NodeJS.ProcessEnv): NonNullable<AppConfig['proxyAuth']> {
  const trustedIps = (env.PROXY_TRUSTED_IPS ?? '').split(',').map((ip) => ip.trim());
  if (trustedIps.length > 32 || trustedIps.some((ip) => !isIP(ip) || ip.includes('%')))
    throw new ConfigError('PROXY_TRUSTED_IPS must list 1–32 exact IPv4/IPv6 addresses');
  const header = (env.PROXY_AUTH_HEADER ?? '').toLowerCase();
  if (
    !/^(remote-user|x-[a-z0-9]+(?:-[a-z0-9]+)*)$/.test(header) ||
    /[^\x21-\x7e]/.test(header) ||
    header.startsWith('x-forwarded-') ||
    header.startsWith('x-leandocs-') ||
    header.length > 128
  )
    throw new ConfigError(
      'PROXY_AUTH_HEADER must be remote-user or a dedicated x- identity header',
    );
  const username = env.PROXY_AUTH_USER ?? '';
  if (username.length < 1 || username.length > 256 || /[^\x21-\x7e]|,/.test(username))
    throw new ConfigError(
      'PROXY_AUTH_USER must be one nonempty ASCII identity without spaces or commas',
    );
  return { trustedIps, header, username };
}

function parseUploadSize(raw: string | undefined): number {
  if (!raw) return 50 * 1024 * 1024;
  const size = Number(raw);
  if (!Number.isSafeInteger(size) || size < 1 || size > 1024 * 1024 * 1024)
    throw new ConfigError('Invalid MAX_UPLOAD_SIZE (expected 1–1073741824 bytes)');
  return size;
}

function parsePublicOrigin(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash ||
      /[\s\\]/.test(raw)
    )
      throw new Error();
    return url.origin;
  } catch {
    throw new ConfigError(
      'PUBLIC_ORIGIN must be one HTTP(S) origin without credentials, path, query or fragment',
    );
  }
}
