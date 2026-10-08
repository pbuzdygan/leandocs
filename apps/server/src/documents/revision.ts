import { createHash } from 'node:crypto';

/** `sha256:` of the exact file bytes (PROJECT_SPEC §28). Also the index's `content_hash`. */
export function revisionOf(bytes: Buffer | string): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}
