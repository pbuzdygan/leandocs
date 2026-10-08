// Starts the built LeanDocs server with an empty data directory for end-to-end tests.
import { cpSync, mkdirSync, readdirSync, rmSync, utimesSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const dataDir = path.join(
  root,
  process.env.PORT === '18769'
    ? '.e2e-mfa-data'
    : process.env.E2E_VISUAL
      ? '.e2e-visual-data'
      : process.env.AUTH_MODE === 'none'
        ? '.e2e-none-data'
        : process.env.AUTH_MODE === 'proxy'
          ? '.e2e-proxy-data'
          : '.e2e-data',
);
rmSync(dataDir, { recursive: true, force: true });
mkdirSync(dataDir, { recursive: true });

// Visual regression (P16-06): fixed documents with fixed ids and an old modification date, so
// the tree, URLs and "Updated …" texts are the same in every run.
if (process.env.E2E_VISUAL) {
  const content = path.join(dataDir, 'content');
  cpSync(path.join(root, 'e2e/visual-content'), content, { recursive: true });
  const fixed = new Date('2026-01-15T09:00:00Z');
  for (const entry of readdirSync(content, { recursive: true }))
    utimesSync(path.join(content, entry), fixed, fixed);
}

process.env.DATA_DIR = dataDir;
process.env.WEB_DIST_DIR = path.join(root, 'apps/web/dist');
process.env.HOST = '127.0.0.1';
process.env.LOG_LEVEL ??= 'warn';

await import(path.join(root, 'apps/server/dist/main.js'));
