/** Document and tree contracts (PROJECT_SPEC §60–61). Paths are `/`-separated, relative to content root. */

export interface TreeFolderNode {
  type: 'folder';
  /** Folder name (last path segment); empty string for the root. */
  name: string;
  /** Relative path; empty string for the root. */
  path: string;
  children: TreeNode[];
}

export interface TreeDocumentNode {
  type: 'document';
  id: string;
  title: string;
  /** File name including `.md`. */
  name: string;
  path: string;
  /** Front matter `aliases`, when present: wiki links may use them (PROJECT_SPEC §22). */
  aliases?: string[];
}

export type TreeNode = TreeFolderNode | TreeDocumentNode;

export interface TreeResponse {
  root: TreeFolderNode;
}

export interface DocumentDto {
  id: string;
  title: string;
  path: string;
  /** Markdown body without the front matter block. */
  content: string;
  /** All front matter keys (unknown keys included). */
  frontmatter: Record<string, unknown>;
  /** `sha256:<hex>` of the file bytes; changes whenever the file changes. */
  revision: string;
  created: string | null;
  updated: string | null;
  /** Set when the front matter block exists but cannot be parsed; it is preserved untouched. */
  frontmatterError?: string;
  /**
   * Set when the body is too large or complex to analyse safely (ADR-0025), with the reason
   * ("larger than 2 MiB"). Show it as plain text and edit it in Source mode only.
   */
  analysisLimited?: string;
  /**
   * Set when the file is not valid UTF-8 text (for example an older Windows encoding). It is shown
   * as decoded, but LeanDocs never writes it, so no byte is lost; convert it to UTF-8 to edit it.
   */
  notUtf8?: boolean;
}

export interface CreateDocumentRequest {
  /** Human-readable name; becomes the file name (sanitised) and the default title. */
  name: string;
  /** Relative folder path; empty or omitted = content root. The folder must exist. */
  folder?: string;
  /** Optional title if it should differ from the name. */
  title?: string;
  /** Initial Markdown body (without front matter). */
  content?: string;
  /** Name of a template in `_templates/` (without `.md`); not combined with `content`. */
  template?: string;
}

/**
 * Edits document properties in the front matter (UI_SPEC §115, P10-04). Omitted fields stay as
 * they are; an empty description or list removes the key.
 */
export interface UpdatePropertiesRequest {
  expectedRevision: string;
  title?: string;
  description?: string;
  tags?: string[];
  aliases?: string[];
}

/** A tag with the number of documents that use it (PROJECT_SPEC §41: derived from documents). */
export interface TagDto {
  name: string;
  count: number;
}

export interface TagsResponse {
  items: TagDto[];
}

/** A pinned document (PROJECT_SPEC §40); pins never modify the `.md` file. */
export interface PinnedDocument {
  id: string;
  title: string;
  path: string;
}

export interface PinsResponse {
  items: PinnedDocument[];
}

/** A template in `_templates/` (PROJECT_SPEC §35). "Blank" is not a file. */
export interface TemplateDto {
  name: string;
}

export interface TemplatesResponse {
  items: TemplateDto[];
}

export interface UpdateDocumentRequest {
  /** New Markdown body (without front matter). Front matter is kept; `updated` is refreshed. */
  content: string;
  /**
   * The `revision` the editor started from. If the file changed since (e.g. edited in another
   * editor), the save is rejected with 409 DOCUMENT_CONFLICT instead of overwriting (§28).
   */
  expectedRevision: string;
}

export interface RenameDocumentRequest {
  /** New file name (sanitised; `.md` added). The document stays in its folder. */
  name: string;
  /** Optionally also change the front matter title. */
  title?: string;
}

export interface MoveDocumentRequest {
  /** Target folder (relative path; empty = content root). */
  folder: string;
  /** Create missing target folders instead of failing with FOLDER_NOT_FOUND. */
  createFolders?: boolean;
}

export interface FolderDto {
  path: string;
  name: string;
}

export interface CreateFolderRequest {
  /** Parent folder (relative path; empty = content root). Must exist. */
  parent?: string;
  name: string;
}

export interface RenameFolderRequest {
  path: string;
  name: string;
}

export interface MoveFolderRequest {
  path: string;
  /** Target parent folder (relative path; empty = content root). */
  targetFolder: string;
}

export interface DeleteFolderResponse {
  /** False when the folder was empty and simply removed. */
  trashed: boolean;
  trashItem?: TrashItem;
}

export interface TrashItem {
  /** Stable id of the trash entry (used for restore / permanent delete). */
  trashId: string;
  kind: 'document' | 'folder';
  /** File or folder name as it was. */
  name: string;
  /** Where it will be restored to. */
  originalPath: string;
  deletedAt: string;
  /** Document id and title (documents only). */
  documentId?: string;
  title?: string;
}

export interface TrashResponse {
  items: TrashItem[];
}

export interface RestoreResponse {
  kind: 'document' | 'folder';
  /** Path the item was restored to. */
  path: string;
  /** Document id after restore (documents only). */
  documentId?: string;
}

export type ScanIssueCode =
  | 'FRONTMATTER_INVALID'
  | 'INVALID_ID'
  | 'DUPLICATE_ID'
  | 'ID_ASSIGNMENT_FAILED'
  | 'UNREADABLE'
  /** Too large or complex to analyse; shown and searched as plain text (ADR-0025). */
  | 'TOO_COMPLEX'
  /** Not valid UTF-8 text: listed and searchable, but never written by LeanDocs. */
  | 'NOT_UTF8'
  /** A folder that cannot be listed (permissions); its documents are missing from the library. */
  | 'UNREADABLE_FOLDER'
  /** A file or folder whose name is not valid UTF-8; it cannot be opened until it is renamed. */
  | 'INVALID_FILE_NAME';

export interface ScanIssue {
  code: ScanIssueCode;
  path: string;
  message: string;
}

export interface IndexRebuildStatus {
  state: 'idle' | 'running' | 'failed';
  /** Files read so far / files found, while running (UI_SPEC §87). */
  done: number;
  total: number;
  /** Last full rebuild that completed (ISO timestamp), `null` if the index was never rebuilt. */
  lastRebuildAt: string | null;
  /** Message of the last failed rebuild. */
  error?: string;
}

export interface IndexStatusResponse {
  documents: number;
  folders: number;
  tags: number;
  /** Problems found while reading the content folder (files are never modified to fix them). */
  issues: ScanIssue[];
  /** Storage overview for Settings › Storage (UI_SPEC §86). */
  storage: {
    dataDir: string;
    contentDir: string;
    attachmentsBytes: number;
    databaseBytes: number;
  };
  rebuild: IndexRebuildStatus;
}

export interface RecentDocument {
  id: string;
  title: string;
  path: string;
  /** Last modification time of the file (ISO 8601). */
  modified: string;
}

export interface RecentDocumentsResponse {
  items: RecentDocument[];
}
