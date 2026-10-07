// A named import lets bundlers keep only this field, not the whole manifest.
import { version } from '../../../package.json';

// Set by the release build (`LEANDOCS_VERSION`, see vite.config.ts and tsup.config.ts) so dev
// images report `devX.Y.Z`; undefined in development and tests.
declare const __LEANDOCS_VERSION__: string | undefined;

/**
 * The LeanDocs version. The root `package.json` is the single source of truth; the server and the
 * web app each bake it in at build time, so a stale browser bundle shows a different frontend
 * version than the server reports (UI_SPEC §88). Release tags: `X.Y.Z` (main), `devX.Y.Z` (dev).
 */
export const APP_VERSION: string =
  typeof __LEANDOCS_VERSION__ === 'string' && __LEANDOCS_VERSION__ !== ''
    ? __LEANDOCS_VERSION__
    : version;

/** Public source repository (owner decision, OQ-2). */
export const APP_REPOSITORY_URL = 'https://github.com/pbuzdygan/leandocs';
