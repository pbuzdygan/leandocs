/**
 * Local drafts (PROJECT_SPEC §47): unsaved editor content kept in this browser so a crash or a
 * closed tab never loses work. A draft never replaces the server document automatically.
 */
export interface Draft {
  content: string;
  /** Revision the edit started from; restoring saves against it, so changes on disk surface as a conflict. */
  baseRevision: string;
  updatedAt: string;
}

export interface DraftStore {
  get(id: string): Draft | undefined;
  set(id: string, draft: Draft): void;
  remove(id: string): void;
}

const key = (id: string) => `leandocs.draft.${id}`;

/** localStorage-backed store; every access is guarded (private mode, quota, blocked storage). */
export const localDraftStore: DraftStore = {
  get(id) {
    try {
      const raw = window.localStorage.getItem(key(id));
      if (!raw) return undefined;
      const draft = JSON.parse(raw) as Partial<Draft>;
      if (typeof draft.content !== 'string' || typeof draft.baseRevision !== 'string')
        return undefined;
      return {
        content: draft.content,
        baseRevision: draft.baseRevision,
        updatedAt: draft.updatedAt ?? '',
      };
    } catch {
      return undefined;
    }
  },
  set(id, draft) {
    try {
      window.localStorage.setItem(key(id), JSON.stringify(draft));
    } catch {
      // Storage full or unavailable: the server save is still the source of truth.
    }
  },
  remove(id) {
    try {
      window.localStorage.removeItem(key(id));
    } catch {
      // ignore
    }
  },
};

export function memoryDraftStore(): DraftStore & { drafts: Map<string, Draft> } {
  const drafts = new Map<string, Draft>();
  return {
    drafts,
    get: (id) => drafts.get(id),
    set: (id, draft) => void drafts.set(id, draft),
    remove: (id) => void drafts.delete(id),
  };
}
