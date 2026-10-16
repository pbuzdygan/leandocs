import { readFileSync } from 'node:fs';
import path from 'node:path';
import { SETUP_TOKEN_FILE } from '../auth/setup.js';

/** The setup token as an operator reads it: from the system folder, not from the API (ADR-0026). */
export function readSetupToken(dataDir: string): string {
  return readFileSync(path.join(dataDir, 'system', SETUP_TOKEN_FILE), 'utf8').trim();
}
