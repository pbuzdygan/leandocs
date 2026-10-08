import { act, screen, waitFor, within } from '@testing-library/react';
import { EditorView } from '@codemirror/view';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { documentDto, mockApi, renderApp, sampleTree, setTestSettings } from '../test/render';

class EventSourceMock extends EventTarget {
  static CLOSED = 2;
  static instances: EventSourceMock[] = [];
  readyState = 1;
  onerror: ((event: Event) => void) | null = null;
  close = vi.fn(() => {
    this.readyState = 2;
  });
  constructor(readonly url: string) {
    super();
    EventSourceMock.instances.push(this);
  }
  emit(type: string, data: unknown) {
    this.dispatchEvent(new MessageEvent(type, { data: JSON.stringify(data) }));
  }
}

const ID = 'id-buzhulk';
const PATH = 'Infrastructure/Servers/BUZHULK.md';
const change = (kind = 'changed') => ({ documents: [{ kind, id: ID, path: PATH }], folders: [] });
beforeEach(() => {
  EventSourceMock.instances = [];
  vi.stubGlobal('EventSource', EventSourceMock);
  setTestSettings({ editor: { defaultMode: 'source' } });
});
function setup() {
  let current = documentDto(ID, PATH, { content: '# Before view\n', revision: 'rev-1' });
  let missing = false;
  const requests = mockApi((request) => {
    if (request.path === '/tree') return { body: { root: sampleTree() } };
    if (request.path === `/documents/${ID}` && request.method === 'GET')
      return missing
        ? {
            status: 404,
            body: { error: { code: 'DOCUMENT_NOT_FOUND', message: 'Document not found' } },
          }
        : { body: current };
    return undefined;
  });
  return {
    requests,
    update: () => {
      current = { ...current, content: '# After view\n', revision: 'rev-2' };
    },
    remove: () => {
      missing = true;
    },
  };
}
const source = () => EventSourceMock.instances.at(-1)!;
function typeLocal() {
  const dom = screen.getByTestId('source-editor').querySelector('.cm-editor')!;
  const editor = EditorView.findFromDOM(dom as HTMLElement)!;
  act(() =>
    editor.dispatch({ changes: { from: editor.state.doc.length, insert: 'Local work\n' } }),
  );
  return editor;
}

describe('frontend external changes', () => {
  it('refreshes the viewed document and navigation, notifies the user and closes on unmount', async () => {
    const backend = setup();
    const app = renderApp(`/doc/${ID}`);
    await screen.findByRole('heading', { name: 'Before view' });
    expect(EventSourceMock.instances).toHaveLength(1);
    expect(source().url).toBe('/api/v1/events');
    backend.update();
    act(() => source().emit('content-changed', change()));
    await screen.findByRole('heading', { name: 'After view' });
    await screen.findByText('Document updated externally.');
    expect(backend.requests.filter((request) => request.path === '/tree').length).toBeGreaterThan(
      1,
    );
    app.unmount();
    expect(source().close).toHaveBeenCalledOnce();
  });

  it('resyncs after ready without opening a second source on document navigation', async () => {
    const backend = setup();
    const { user } = renderApp(`/doc/${ID}`);
    await screen.findByRole('heading', { name: 'Before view' });
    backend.update();
    act(() => source().emit('ready', { resync: true }));
    await screen.findByRole('heading', { name: 'After view' });
    await user.click(screen.getByRole('tab', { name: 'Edit' }));
    await screen.findByTestId('source-editor');
    expect(EventSourceMock.instances).toHaveLength(1);
  });

  it('keeps unsaved editor content and drafts and shows a conflict before any save attempt', async () => {
    const backend = setup();
    renderApp(`/doc/${ID}/edit`);
    await screen.findByTestId('source-editor');
    const editor = typeLocal();
    backend.update();
    act(() => source().emit('content-changed', change()));
    const dialog = await screen.findByRole('dialog', {
      name: 'Document changed outside the editor',
    });
    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: 'Reload from disk' })).toBeEnabled(),
    );
    expect(editor.state.doc.toString()).toContain('Local work');
    expect(editor.state.doc.toString()).not.toContain('After view');
    expect(backend.requests.some((request) => request.method === 'PUT')).toBe(false);
    expect(window.localStorage.getItem(`leandocs.draft.${ID}`)).toContain('Local work');
  });

  it('retains the editor and permits saving a copy after external deletion', async () => {
    const backend = setup();
    renderApp(`/doc/${ID}/edit`);
    await screen.findByTestId('source-editor');
    const editor = typeLocal();
    backend.remove();
    act(() => source().emit('content-changed', change('removed')));
    const dialog = await screen.findByRole('dialog', {
      name: 'Document changed outside the editor',
    });
    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: 'Reload from disk' })).toBeDisabled(),
    );
    expect(within(dialog).getByRole('button', { name: 'Save as copy' })).toBeEnabled();
    expect(editor.state.doc.toString()).toContain('Local work');
    expect(backend.requests.some((request) => request.method === 'PUT')).toBe(false);
  });

  it('ignores malformed events and closes when the session has been revoked', async () => {
    setup();
    const { client } = renderApp(`/doc/${ID}`);
    await screen.findByRole('heading', { name: 'Before view' });
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    act(() => source().emit('content-changed', { documents: [{}], folders: [] }));
    expect(invalidate).not.toHaveBeenCalled();
    mockApi({ 'GET /auth/session': { authMode: 'local', user: null, csrfToken: '' } });
    act(() => source().onerror?.(new Event('error')));
    await waitFor(() => expect(source().close).toHaveBeenCalled());
    await screen.findByRole('heading', { name: 'Sign in' });
  });

  it('reopens a closed transport after a failed session check and cancels retries on unmount', async () => {
    setup();
    const app = renderApp(`/doc/${ID}`);
    await screen.findByRole('heading', { name: 'Before view' });
    vi.useFakeTimers();
    try {
      vi.mocked(fetch).mockRejectedValueOnce(new TypeError('Offline'));
      source().readyState = EventSourceMock.CLOSED;
      await act(async () => source().onerror?.(new Event('error')));
      await act(async () => vi.advanceTimersByTimeAsync(3000));
      expect(EventSourceMock.instances).toHaveLength(2);
      source().readyState = EventSourceMock.CLOSED;
      await act(async () => source().onerror?.(new Event('error')));
      app.unmount();
      await act(async () => vi.advanceTimersByTimeAsync(3000));
      expect(EventSourceMock.instances).toHaveLength(2);
      expect(source().close).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });
});
