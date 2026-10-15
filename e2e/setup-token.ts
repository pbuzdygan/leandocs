import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * The setup token as an operator reads it (ADR-0026): the server writes it to `system/setup-token`
 * in its data folder (`e2e/server.mjs` chooses the folder per project).
 */
export function readSetupToken(dataDir: string): string {
  const file = path.resolve(import.meta.dirname, '..', dataDir, 'system', 'setup-token');
  return readFileSync(file, 'utf8').trim();
}
