// A named import lets bundlers keep only this field, not the whole manifest.
import { version } from '../../../package.json';

/**
 * The LeanDocs version. The root `package.json` is the single source of truth; the server and the
 * web app each bake it in at build time, so a stale browser bundle shows a different frontend
 * version than the server reports (UI_SPEC §88). Release tags are `v<APP_VERSION>`.
 */
export const APP_VERSION: string = version;

/** Public source repository (owner decision, OQ-2). */
export const APP_REPOSITORY_URL = 'https://github.com/pbuzdygan/leandocs';
