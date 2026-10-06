/** External index changes sent by GET /api/v1/events. Paths are relative to the content root. */
export interface DocumentChange {
  kind: 'added' | 'changed' | 'removed';
  id: string;
  path: string;
  /** Present when a document retains its id while moving to another path. */
  previousPath?: string;
}

export interface FolderChange {
  kind: 'added' | 'removed';
  path: string;
}

export interface ContentChanges {
  documents: DocumentChange[];
  folders: FolderChange[];
}

/** Every connection needs a fresh snapshot; changes during disconnection are not replayed. */
export interface EventsReady {
  resync: true;
}
