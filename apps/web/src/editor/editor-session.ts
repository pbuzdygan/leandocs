import type { DocumentDto } from '@leandocs/shared';
import { ApiError } from '../api/client';
import type { Draft, DraftStore } from './drafts';

/** UI_SPEC §33 */
export type SaveStatus = 'saved' | 'unsaved' | 'saving' | 'conflict' | 'error';

export interface SessionState {
  status: SaveStatus;
  content: string;
  /** Revision of the file this editor is based on (sent as `expectedRevision`). */
  revision: string;
  /** Message for `error`. */
  error?: string;
  /** Revision on disk reported by a 409 (for `conflict`). */
  conflictRevision?: string;
  /** Increments when the content is replaced from outside the editor widget (reload, draft restore). */
  externalVersion: number;
}

export interface SessionOptions {
  id: string;
  content: string;
  revision: string;
  save: (content: string, expectedRevision: string) => Promise<DocumentDto>;
  drafts: DraftStore;
  /** Debounce before autosave (PROJECT_SPEC §46). */
  autosaveDelay?: number;
  /**
   * Off: save only on `saveNow` (Save, Ctrl/Cmd+S, Done) and when leaving the editor. Drafts are
   * still written, so nothing is lost on a crash or a closed tab.
   */
  autosave?: boolean;
  onSaved?: (document: DocumentDto) => void;
  onReload?: (document: DocumentDto) => void;
}

/**
 * Editing session for one document, independent of React and of the editor widget:
 * dirty tracking, debounced autosave, one save at a time, local drafts, conflicts (409).
 * Autosave never hides failures — `error` and `conflict` stay until resolved.
 */
export class EditorSession {
  private state: SessionState;
  private savedContent: string;
  private listeners = new Set<() => void>();
  private autosaveTimer: ReturnType<typeof setTimeout> | undefined;
  private inFlight: Promise<void> | undefined;
  private externalChanges = 0;
  private reloads = 0;
  private readonly autosaveDelay: number;

  constructor(private readonly options: SessionOptions) {
    this.state = {
      status: 'saved',
      content: options.content,
      revision: options.revision,
      externalVersion: 0,
    };
    this.savedContent = options.content;
    this.autosaveDelay = options.autosaveDelay ?? 1500;
  }

  getState = (): SessionState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  get isDirty(): boolean {
    return this.state.content !== this.savedContent;
  }

  /** Called on every editor change. */
  setContent(content: string): void {
    if (content === this.state.content) return;
    const blocked = this.state.status === 'conflict';
    this.update({
      content,
      status: blocked
        ? 'conflict'
        : this.state.status === 'saving'
          ? 'saving'
          : content === this.savedContent
            ? 'saved'
            : 'unsaved',
    });
    this.flushDraft(true);
    if (!blocked) this.scheduleAutosave();
  }

  /** Save immediately (Ctrl/Cmd+S, leaving edit mode). Resolves when nothing is pending. */
  async saveNow(): Promise<void> {
    this.clearAutosave();
    for (;;) {
      if (this.inFlight) {
        await this.inFlight;
        if (this.getState().status === 'error') return;
        continue;
      }
      if (this.state.status === 'conflict' || !this.isDirty) return;
      await this.runSave(this.state.revision);
      const { status } = this.getState(); // re-read: the save changed it
      if (status === 'error' || status === 'conflict') return;
    }
  }

  /** Explicit "keep my version" after reviewing a conflict: save against the revision on disk. */
  async overwrite(reviewedRevision = this.state.conflictRevision): Promise<void> {
    if (this.inFlight) await this.inFlight;
    const revision = reviewedRevision;
    if (!revision) return;
    this.update({ status: 'unsaved', revision, conflictRevision: undefined });
    await this.runSave(revision);
  }

  /** Replace the editor content with the version on disk and drop local changes. */
  reload(document: DocumentDto): void {
    this.reloads++;
    this.clearAutosave();
    this.savedContent = document.content;
    this.options.drafts.remove(this.options.id);
    this.update({
      content: document.content,
      revision: document.revision,
      status: 'saved',
      error: undefined,
      conflictRevision: undefined,
      externalVersion: this.state.externalVersion + 1,
    });
    this.options.onReload?.(document);
  }

  /** An outside edit is a conflict even in a clean editor (UI_SPEC §70). */
  syncFromServer(document: DocumentDto): boolean {
    if (document.revision === this.state.revision) return false;
    this.markExternalChange(document.revision);
    return true;
  }

  /** In-app rename/move responses may advance metadata without discarding local edits. */
  syncFromApp(document: DocumentDto): void {
    if (document.id !== this.options.id || this.inFlight || this.state.status === 'conflict')
      return;
    if (document.content !== this.savedContent) {
      // A move can rewrite links, or another editor may have changed the body before the mutation.
      this.markExternalChange(document.revision);
    } else {
      this.update({ revision: document.revision });
      if (this.isDirty) this.flushDraft();
    }
  }

  /** Pause immediately on notification, retaining the editor's base revision and local draft. */
  markExternalChange(revision?: string): void {
    this.externalChanges++;
    this.clearAutosave();
    this.update({ status: 'conflict', conflictRevision: revision });
    this.flushDraft();
  }

  /** Restore a local draft. It saves against the draft's base revision, so a newer disk version shows as a conflict. */
  restoreDraft(draft: Draft): void {
    this.update({
      content: draft.content,
      revision: draft.baseRevision,
      status: 'unsaved',
      error: undefined,
      externalVersion: this.state.externalVersion + 1,
    });
    this.flushDraft();
    this.scheduleAutosave();
  }

  discardDraft(): void {
    this.options.drafts.remove(this.options.id);
  }

  /**
   * Leaving the editor: the local draft is written first, then pending changes are saved
   * best-effort, so nothing is lost if that save fails. Safe to call more than once
   * (React StrictMode runs effect cleanups twice in development).
   */
  flushOnLeave(): void {
    this.flushDraft();
    if (this.isDirty && this.state.status !== 'conflict' && !this.inFlight) void this.saveNow();
    this.clearAutosave();
  }

  private async runSave(expectedRevision: string): Promise<void> {
    const externalChanges = this.externalChanges;
    const reloads = this.reloads;
    const content = this.state.content;
    this.update({ status: 'saving', error: undefined });
    const run = (async () => {
      try {
        const document = await this.options.save(content, expectedRevision);
        if (reloads !== this.reloads) return;
        this.savedContent = content;
        const clean = this.state.content === content;

        this.update({
          status:
            externalChanges !== this.externalChanges ? 'conflict' : clean ? 'saved' : 'unsaved',
          revision: document.revision,
          conflictRevision:
            externalChanges !== this.externalChanges ? this.state.conflictRevision : undefined,
        });
        this.flushDraft(true);
        this.options.onSaved?.(document);
        if (!clean && this.state.status !== 'conflict') this.scheduleAutosave();
      } catch (error) {
        if (reloads !== this.reloads) return;
        if (error instanceof ApiError && error.code === 'DOCUMENT_CONFLICT') {
          const current = error.details?.currentRevision;
          this.update({
            status: 'conflict',
            conflictRevision: typeof current === 'string' ? current : undefined,
          });
        } else if (externalChanges !== this.externalChanges) {
          this.update({ status: 'conflict' });
        } else {
          this.update({
            status: 'error',
            error: error instanceof Error ? error.message : 'Save failed',
          });
        }
        this.flushDraft();
      }
    })();
    this.inFlight = run;
    try {
      await run;
    } finally {
      this.inFlight = undefined;
    }
  }

  private scheduleAutosave(): void {
    this.clearAutosave();
    if (this.options.autosave === false) return;
    this.autosaveTimer = setTimeout(() => {
      this.autosaveTimer = undefined;
      if (this.state.status === 'unsaved' || this.state.status === 'error') void this.saveNow();
    }, this.autosaveDelay);
  }

  private clearAutosave(): void {
    if (this.autosaveTimer) clearTimeout(this.autosaveTimer);
    this.autosaveTimer = undefined;
  }

  private flushDraft(removeClean = false): void {
    if (!this.isDirty && this.state.status !== 'conflict') {
      if (removeClean) this.options.drafts.remove(this.options.id);
      return;
    }
    this.options.drafts.set(this.options.id, {
      content: this.state.content,
      baseRevision: this.state.revision,
      updatedAt: new Date().toISOString(),
    });
  }

  private update(patch: Partial<SessionState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }
}
