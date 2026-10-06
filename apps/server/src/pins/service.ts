import type { PinnedDocument } from '@leandocs/shared';
import type { DocumentRegistry } from '../documents/registry.js';
import { AppError } from '../errors.js';

/**
 * Pinned documents (PROJECT_SPEC §40, P10-05), stored by document id in `app.db`. Pins of
 * documents that are currently missing (trashed, moved out with a provisional id) are kept but
 * not listed, so a restored document is pinned again.
 */
export class PinService {
  constructor(private readonly registry: DocumentRegistry) {}

  list(): PinnedDocument[] {
    const rows = this.registry.store.db
      .prepare<[], { document_id: string }>(
        'SELECT document_id FROM pins ORDER BY pinned_at, document_id',
      )
      .all();
    const items: PinnedDocument[] = [];
    for (const { document_id: id } of rows) {
      const entry = this.registry.get(id);
      if (entry) items.push({ id: entry.id, title: entry.title, path: entry.path });
    }
    return items;
  }

  pin(id: string): void {
    if (!this.registry.get(id)) throw new AppError(404, 'DOCUMENT_NOT_FOUND', 'Document not found');
    this.registry.store.db
      .prepare('INSERT OR IGNORE INTO pins (document_id, pinned_at) VALUES (?, ?)')
      .run(id, new Date().toISOString());
  }

  unpin(id: string): void {
    this.registry.store.db.prepare('DELETE FROM pins WHERE document_id = ?').run(id);
  }
}
