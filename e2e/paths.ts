import path from 'node:path';

/**
 * Everything a browser-test run writes stays in one ignored folder, `.e2e/` (the same layout as
 * `e2e/server.mjs`): one data directory per test server under `data/`, and Playwright's results
 * (traces, screenshots, sign-in states) under `results/`.
 */
export const E2E_DIR = path.resolve(import.meta.dirname, '../.e2e');
export const RESULTS_DIR = path.join(E2E_DIR, 'results');

/** Data directory of a test server: `default`, `mfa`, `visual`, `none` or `proxy`. */
export function dataDir(server: 'default' | 'mfa' | 'visual' | 'none' | 'proxy'): string {
  return path.join(E2E_DIR, 'data', server);
}

/** Documents of the default test server. */
export const CONTENT = path.join(dataDir('default'), 'content');

export const AUTH_STATE = path.join(RESULTS_DIR, 'auth-state.json');
export const VISUAL_AUTH_STATE = path.join(RESULTS_DIR, 'visual-auth-state.json');
