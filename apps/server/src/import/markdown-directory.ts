import { MAX_IMPORT_DOCUMENT_BYTES } from '@leandocs/shared';
import { ASSETS_SUFFIX, isDocumentFileName } from '../filesystem/file-name.js';
import {
  ImportItemError,
  type ConvertedDocument,
  type Importer,
  type ScannedDocument,
  type ScannedItem,
} from './importer.js';

const LIMIT_MIB = MAX_IMPORT_DOCUMENT_BYTES / 1024 / 1024;

/**
 * Generic Markdown directory (PROJECT_SPEC §67): every `.md` file keeps its folder path and its
 * bytes; existing front matter is kept (identity is handled by ImportService). Hidden entries
 * (`.git/`, `.obsidian/`) are skipped. Attachments are not imported yet (P13-06).
 */
export const markdownDirectoryImporter: Importer = {
  kind: 'markdown-directory',

  reads(path) {
    return isDocumentFileName(baseName(path));
  },

  detect(entries) {
    return entries.some((entry) => this.reads(entry.path));
  },

  scan(entries) {
    const items: ScannedItem[] = [];
    // One line per skipped folder instead of thousands of `.git/objects/…` lines.
    const folders = new Map<string, { reason: string; files: number }>();
    for (const entry of entries) {
      const segments = entry.path.split('/');
      const folderIndex = segments
        .slice(0, -1)
        .findIndex(
          (segment) => segment.startsWith('.') || segment.toLowerCase().endsWith(ASSETS_SUFFIX),
        );
      if (folderIndex !== -1) {
        const folder = `${segments.slice(0, folderIndex + 1).join('/')}/`;
        const reason = segments[folderIndex]!.startsWith('.')
          ? 'Hidden folder'
          : 'Attachment folders are not imported yet';
        const current = folders.get(folder) ?? { reason, files: 0 };
        current.files++;
        folders.set(folder, current);
      } else if (baseName(entry.path).startsWith('.')) {
        items.push({ kind: 'skipped', source: entry.path, reason: 'Hidden file' });
      } else if (!this.reads(entry.path)) {
        items.push({
          kind: 'skipped',
          source: entry.path,
          reason: 'Only Markdown files are imported',
        });
      } else if (entry.tooLarge || !entry.bytes) {
        items.push({
          kind: 'skipped',
          source: entry.path,
          reason: `Larger than ${LIMIT_MIB} MiB`,
        });
      } else {
        items.push({
          kind: 'document',
          source: entry.path,
          target: entry.path,
          bytes: entry.bytes,
        });
      }
    }
    for (const [source, { reason, files }] of folders)
      items.push({
        kind: 'skipped',
        source,
        reason: `${reason} (${files} ${files === 1 ? 'file' : 'files'})`,
      });
    return items.sort((a, b) => (a.source < b.source ? -1 : a.source > b.source ? 1 : 0));
  },

  convert(item: ScannedDocument): ConvertedDocument {
    let text: string;
    try {
      // Keep a byte order mark: the document is stored exactly as it was.
      text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(item.bytes);
    } catch {
      throw new ImportItemError('The file is not UTF-8 text');
    }
    return { text, notes: [], warnings: [], converted: false };
  },
};

function baseName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}
