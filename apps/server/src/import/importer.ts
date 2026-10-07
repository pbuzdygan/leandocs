import type { ImporterKind } from '@leandocs/shared';

/**
 * Importer contract (PROJECT_SPEC §66, ADR-0022). An importer understands one source format:
 * `detect`, `scan` and `convert` are format-specific. `preview` and `import` are shared by every
 * importer and live in ImportService, because all importers end with Markdown documents that are
 * placed, identified and written the same way.
 */
export interface Importer {
  readonly kind: ImporterKind;
  /** Whether the file content is needed. Other uploads are only counted and listed. */
  reads(path: string): boolean;
  /** True when the selection contains something this importer can import. */
  detect(entries: readonly ImportEntry[]): boolean;
  /** Classifies the selection into documents to convert and entries to skip (with a reason). */
  scan(entries: readonly ImportEntry[]): ScannedItem[];
  /** Turns one scanned document into Markdown text. Throws ImportItemError when it cannot. */
  convert(item: ScannedDocument): ConvertedDocument;
}

/** One uploaded file. `path` is relative to the selection, `/`-separated and already validated. */
export interface ImportEntry {
  path: string;
  size: number;
  /** Present when the importer reads this file and it is within the size limit. */
  bytes?: Buffer;
  /** The file was larger than the importer may read. */
  tooLarge?: boolean;
}

export interface ScannedDocument {
  kind: 'document';
  source: string;
  /** Target path relative to the destination folder, before name sanitising (ends in `.md`). */
  target: string;
  bytes: Buffer;
}

export interface SkippedEntry {
  kind: 'skipped';
  /** A file path, or a folder path ending in `/` that stands for all files below it. */
  source: string;
  reason: string;
}

export type ScannedItem = ScannedDocument | SkippedEntry;

export interface ConvertedDocument {
  text: string;
  /** The source was converted from another format (shown as "Converted" in the preview). */
  converted: boolean;
  notes: string[];
  warnings: string[];
}

/** A single item cannot be imported; the rest of the selection continues. */
export class ImportItemError extends Error {}
