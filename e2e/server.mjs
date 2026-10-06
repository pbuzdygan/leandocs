// Starts the built LeanDocs server with an empty data directory for end-to-end tests.
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const dataDir = path.join(
  root,
  process.env.PORT === '18769'
    ? '.e2e-mfa-data'
    : process.env.AUTH_MODE === 'none'
      ? '.e2e-none-data'
      : process.env.AUTH_MODE === 'proxy'
        ? '.e2e-proxy-data'
        : '.e2e-data',
);
rmSync(dataDir, { recursive: true, force: true });
mkdirSync(dataDir, { recursive: true });

process.env.DATA_DIR = dataDir;
process.env.WEB_DIST_DIR = path.join(root, 'apps/web/dist');
process.env.HOST = '127.0.0.1';
process.env.LOG_LEVEL ??= 'warn';

await import(path.join(root, 'apps/server/dist/main.js'));
