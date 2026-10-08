import type { DocumentDto } from '@leandocs/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';
import { memoryDraftStore } from './drafts';
import { EditorSession } from './editor-session';

function doc(content: string, revision: string): DocumentDto {
  return {
    id: 'doc-1',
    title: 'Doc',
    path: 'Doc.md',
    content,
    frontmatter: {},
    revision,
    created: null,
    updated: null,
  };
}

function setup(
  overrides: {
    save?: (content: string, rev: string) => Promise<DocumentDto>;
    autosave?: boolean;
  } = {},
) {
  let counter = 1;
  const save = vi.fn(
    overrides.save ?? (async (content: string) => doc(content, `rev-${++counter}`)),
  );
  const drafts = memoryDraftStore();
  const onSaved = vi.fn();
  const session = new EditorSession({
    id: 'doc-1',
    content: 'v1',
    revision: 'rev-1',
    save,
    drafts,
    onSaved,
    autosaveDelay: 1000,
    autosave: overrides.autosave,
  });
  return { session, save, drafts, onSaved };
}

const conflict = () =>
  new ApiError(409, 'DOCUMENT_CONFLICT', 'Document has changed', { currentRevision: 'rev-disk' });

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('EditorSession', () => {
  it('accepts in-app metadata revisions while preserving unsaved text and its recovery revision', async () => {
    const { session, drafts, save } = setup();
    session.syncFromApp(doc('v1', 'rev-renamed'));
    expect(session.getState()).toMatchObject({ status: 'saved', revision: 'rev-renamed' });
    session.setContent('local work');
    session.syncFromApp(doc('v1', 'rev-moved'));
    expect(session.getState()).toMatchObject({
      status: 'unsaved',
      content: 'local work',
      revision: 'rev-moved',
    });
    expect(drafts.get('doc-1')?.baseRevision).toBe('rev-moved');
    await session.saveNow();
    expect(save).toHaveBeenCalledWith('local work', 'rev-moved');
  });

  it('never clears an external conflict or silently adopts a changed body after an app mutation', () => {
    const { session } = setup();
    session.syncFromApp(doc('outside body', 'rev-2'));
    expect(session.getState()).toMatchObject({
      status: 'conflict',
      content: 'v1',
      revision: 'rev-1',
    });
    session.syncFromApp(doc('v1', 'rev-3'));
    expect(session.getState()).toMatchObject({
      status: 'conflict',
      revision: 'rev-1',
      conflictRevision: 'rev-2',
    });
  });

  it('starts clean and becomes unsaved on change', () => {
    const { session } = setup();
    expect(session.getState()).toMatchObject({ status: 'saved', content: 'v1', revision: 'rev-1' });
    session.setContent('v2');
    expect(session.getState().status).toBe('unsaved');
    session.setContent('v1');
    expect(session.getState().status).toBe('saved');
  });

  it('with autosave off, keeps a draft and saves only on request or when leaving', async () => {
    const { session, save, drafts } = setup({ autosave: false });
    session.setContent('a');
    await vi.advanceTimersByTimeAsync(10_000);
    expect(save).not.toHaveBeenCalled();
    expect(session.getState().status).toBe('unsaved');
    expect(drafts.get('doc-1')?.content).toBe('a');
    await session.saveNow();
    expect(save).toHaveBeenCalledWith('a', 'rev-1');
    session.setContent('ab');
    await vi.advanceTimersByTimeAsync(10_000);
    expect(save).toHaveBeenCalledTimes(1);
    session.flushOnLeave();
    await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith('ab', 'rev-2');
  });

  it('autosaves once after the debounce, with the expected revision', async () => {
    const { session, save, onSaved } = setup();
    session.setContent('a');
    await vi.advanceTimersByTimeAsync(500);
    session.setContent('ab');
    await vi.advanceTimersByTimeAsync(500);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(600);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith('ab', 'rev-1');
    expect(session.getState()).toMatchObject({ status: 'saved', revision: 'rev-2' });
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ revision: 'rev-2' }));
  });

  it('notifies subscribers about status changes', async () => {
    const { session } = setup();
    const seen: string[] = [];
    session.subscribe(() => seen.push(session.getState().status));
    session.setContent('x');
    await session.saveNow();
    expect(seen).toEqual(['unsaved', 'saving', 'saved']);
  });

  it('never runs two saves at once and saves changes made during a save afterwards', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    let n = 1;
    const { session, save } = setup({
      save: async (content) => {
        if (n === 1) await gate;
        return doc(content, `rev-${++n}`);
      },
    });
    session.setContent('first');
    const first = session.saveNow();
    session.setContent('second');
    expect(session.getState().status).toBe('saving');
    const second = session.saveNow();
    expect(save).toHaveBeenCalledTimes(1);
    release();
    await Promise.all([first, second]);
    expect(save.mock.calls).toEqual([
      ['first', 'rev-1'],
      ['second', 'rev-2'],
    ]);
    expect(session.getState()).toMatchObject({
      status: 'saved',
      revision: 'rev-3',
      content: 'second',
    });
  });

  it('enters conflict on 409, keeps the content and pauses autosave', async () => {
    const { session, save, drafts } = setup({ save: async () => Promise.reject(conflict()) });
    session.setContent('mine');
    await session.saveNow();
    expect(session.getState()).toMatchObject({
      status: 'conflict',
      content: 'mine',
      conflictRevision: 'rev-disk',
    });
    expect(drafts.get('doc-1')).toMatchObject({ content: 'mine', baseRevision: 'rev-1' });
    session.setContent('mine, more');
    await vi.advanceTimersByTimeAsync(5000);
    expect(save).toHaveBeenCalledTimes(1);
    expect(session.getState().status).toBe('conflict');
  });

  it('reloads the disk version and forgets local changes', async () => {
    const { session, drafts } = setup({ save: async () => Promise.reject(conflict()) });
    session.setContent('mine');
    await session.saveNow();
    session.reload(doc('disk', 'rev-disk'));
    expect(session.getState()).toMatchObject({
      status: 'saved',
      content: 'disk',
      revision: 'rev-disk',
      externalVersion: 1,
    });
    expect(session.isDirty).toBe(false);
    expect(drafts.get('doc-1')).toBeUndefined();
  });

  it('overwrites only when explicitly asked, against the revision on disk', async () => {
    const save = vi
      .fn()
      .mockRejectedValueOnce(conflict())
      .mockResolvedValueOnce(doc('mine', 'rev-after'));
    const { session } = setup({ save });
    session.setContent('mine');
    await session.saveNow();
    await session.overwrite();
    expect(save).toHaveBeenLastCalledWith('mine', 'rev-disk');
    expect(session.getState()).toMatchObject({ status: 'saved', revision: 'rev-after' });
  });

  it('shows errors, keeps them visible and retries on the next change or manual save', async () => {
    const save = vi
      .fn()
      .mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'Server unreachable'))
      .mockResolvedValueOnce(doc('x', 'rev-2'));
    const { session } = setup({ save });
    session.setContent('x');
    await session.saveNow();
    expect(session.getState()).toMatchObject({ status: 'error', error: 'Server unreachable' });
    await vi.advanceTimersByTimeAsync(5000);
    expect(session.getState().status).toBe('error');
    await session.saveNow();
    expect(session.getState()).toMatchObject({ status: 'saved', revision: 'rev-2' });
  });

  it('writes a local draft while editing and removes it after a successful save', async () => {
    const { session, drafts } = setup();
    session.setContent('draft text');
    // A crash before any timer fires must still leave a recoverable draft.
    expect(drafts.get('doc-1')).toMatchObject({ content: 'draft text', baseRevision: 'rev-1' });
    await vi.advanceTimersByTimeAsync(1000);
    expect(session.getState().status).toBe('saved');
    expect(drafts.get('doc-1')).toBeUndefined();
  });

  it('restores a draft against its base revision', () => {
    const { session } = setup();
    session.restoreDraft({ content: 'old draft', baseRevision: 'rev-0', updatedAt: '' });
    expect(session.getState()).toMatchObject({
      status: 'unsaved',
      content: 'old draft',
      revision: 'rev-0',
      externalVersion: 1,
    });
  });

  it('preserves clean and dirty editor content when an external revision arrives (UI_SPEC §70)', () => {
    const { session } = setup();
    expect(session.syncFromServer(doc('outside edit', 'rev-9'))).toBe(true);
    expect(session.getState()).toMatchObject({
      content: 'v1',
      revision: 'rev-1',
      status: 'conflict',
      conflictRevision: 'rev-9',
    });
    session.setContent('local');
    expect(session.syncFromServer(doc('another', 'rev-10'))).toBe(true);
    expect(session.getState().content).toBe('local');
  });

  it('pauses autosave and retains the draft immediately, before a revision fetch completes', async () => {
    const { session, save, drafts } = setup();
    session.setContent('mine');
    session.markExternalChange();
    await vi.advanceTimersByTimeAsync(5000);
    expect(save).not.toHaveBeenCalled();
    expect(drafts.get('doc-1')).toMatchObject({ content: 'mine', baseRevision: 'rev-1' });
    expect(session.getState().status).toBe('conflict');
  });

  it('keeps a conflict when an older successful save response arrives after an external event', async () => {
    let resolve!: (document: DocumentDto) => void;
    const { session, drafts } = setup({
      save: () =>
        new Promise((done) => {
          resolve = done;
        }),
    });
    session.setContent('mine');
    const save = session.saveNow();
    session.markExternalChange('rev-external');
    resolve(doc('mine', 'rev-2'));
    await save;
    expect(session.getState()).toMatchObject({
      content: 'mine',
      status: 'conflict',
      conflictRevision: 'rev-external',
    });
    expect(drafts.get('doc-1')?.content).toBe('mine');
  });

  it('does not undo an explicit reload when a previous save response arrives', async () => {
    let resolve!: (document: DocumentDto) => void;
    const { session } = setup({
      save: () =>
        new Promise((done) => {
          resolve = done;
        }),
    });
    session.setContent('mine');
    const save = session.saveNow();
    session.reload(doc('disk', 'rev-3'));
    resolve(doc('mine', 'rev-2'));
    await save;
    expect(session.getState()).toMatchObject({
      content: 'disk',
      revision: 'rev-3',
      status: 'saved',
    });
  });

  it('does not erase an unaccepted recovery draft when a clean editor unmounts', () => {
    const { session, drafts } = setup();
    drafts.set('doc-1', { content: 'recover me', baseRevision: 'rev-0', updatedAt: '' });
    session.flushOnLeave();
    expect(drafts.get('doc-1')?.content).toBe('recover me');
  });

  it('removes the draft when changes are undone back to the saved content', () => {
    const { session, drafts } = setup();
    session.setContent('changed');
    session.setContent('v1');
    expect(drafts.get('doc-1')).toBeUndefined();
  });

  it('keeps a second disk change in conflict after an explicit overwrite attempt', async () => {
    const save = vi
      .fn()
      .mockRejectedValueOnce(conflict())
      .mockRejectedValueOnce(
        new ApiError(409, 'DOCUMENT_CONFLICT', 'Changed again', { currentRevision: 'rev-newer' }),
      );
    const { session, drafts } = setup({ save });
    session.setContent('mine');
    await session.saveNow();
    await session.overwrite();
    expect(session.getState()).toMatchObject({ status: 'conflict', conflictRevision: 'rev-newer' });
    await vi.advanceTimersByTimeAsync(5000);
    expect(save).toHaveBeenCalledTimes(2);
    expect(drafts.get('doc-1')?.content).toBe('mine');
  });

  it('updates the recovery revision when a save finishes with newer edits pending', async () => {
    let resolve!: (document: DocumentDto) => void;
    const { session, drafts } = setup({
      save: () =>
        new Promise((done) => {
          resolve = done;
        }),
    });
    session.setContent('first');
    const saving = session.saveNow();
    session.setContent('second');
    resolve(doc('first', 'rev-2'));
    // Let the first request complete; the next save remains pending.
    await vi.advanceTimersByTimeAsync(0);
    expect(drafts.get('doc-1')).toMatchObject({ content: 'second', baseRevision: 'rev-2' });
    resolve(doc('second', 'rev-3'));
    await saving;
  });

  it('flushOnLeave writes the draft and saves pending changes', async () => {
    const { session, drafts, save } = setup();
    session.setContent('leaving');
    session.flushOnLeave();
    expect(drafts.get('doc-1')).toMatchObject({ content: 'leaving' });
    await vi.runAllTimersAsync();
    expect(save).toHaveBeenCalledWith('leaving', 'rev-1');
  });
});
