/** Import / migration (PROJECT_SPEC §66–71). */

export const IMPORTERS = ['markdown-directory', 'html'] as const;
export type ImporterKind = (typeof IMPORTERS)[number];

/** Limits for one import request (one browser selection). */
export const MAX_IMPORT_FILES = 10_000;
/** Largest Markdown file that is imported; bigger ones are skipped with a warning. */
export const MAX_IMPORT_DOCUMENT_BYTES = 10 * 1024 * 1024;

/**
 * Content type of an upload part that carries only a file name (ADR-0022, P13-06). The preview
 * lists other files by name; the import then sends the files the preview used as attachments.
 */
export const IMPORT_NAME_ONLY_TYPE = 'application/x-leandocs-name-only';

/**
 * `ready` / `skipped` in a preview; `imported` / `skipped` / `failed` after the import ran.
 */
export type ImportItemStatus = 'ready' | 'imported' | 'skipped' | 'failed';

export interface ImportItem {
  /** Path inside the selection, `/`-separated (e.g. `Notes/Network/Router.md`). */
  source: string;
  /** Content-relative target path; absent when the item is not imported. */
  destination?: string;
  status: ImportItemStatus;
  /** Set for an attachment copy: the source path of the document that uses it. */
  attachmentOf?: string;
  /** The source was converted to Markdown (e.g. from HTML). */
  converted?: boolean;
  /** Why the item is skipped or failed. */
  reason?: string;
  /** Set once the document exists in the library. */
  documentId?: string;
  /** What the import changes in the file (e.g. a document id is added). */
  notes: string[];
  /** Anything the user should review before or after importing. */
  warnings: string[];
}

export interface ImportSummary {
  documents: number;
  attachments: number;
  folders: number;
  skipped: number;
  failed: number;
  warnings: number;
}

export interface ImportReport {
  importer: ImporterKind;
  /** Content folder that receives the selection (`''` is the content root). */
  destination: string;
  /** True for a preview: nothing was written. */
  dryRun: boolean;
  items: ImportItem[];
  summary: ImportSummary;
}
