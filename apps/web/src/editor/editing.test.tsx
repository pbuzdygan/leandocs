import { act, screen, waitFor, within } from '@testing-library/react';
import { EditorView } from '@codemirror/view';
import { beforeEach, describe, expect, it } from 'vitest';
import { documentDto, mockApi, renderApp, sampleTree, type MockRequest } from '../test/render';

const ID = 'id-buzhulk';
const PATH = 'Infrastructure/Servers/BUZHULK.md';

function editorView(): EditorView {
  const dom = screen.getByTestId('source-editor').querySelector('.cm-editor');
  const view = dom && EditorView.findFromDOM(dom as HTMLElement);
  if (!view) throw new Error('CodeMirror view not found');
  return view;
}

function type(text: string) {
  const view = editorView();
  act(() => {
    view.dispatch({ changes: { from: view.state.doc.length, insert: text } });
  });
}

type Handler = (request: MockRequest) => { status?: number; body?: unknown } | undefined;

/** API with one document; `onPut` decides how saves are answered. */
function api(onPut: Handler, extra: Handler = () => undefined) {
  let current = documentDto(ID, PATH, { content: '# BUZHULK\n\nHello\n', revision: 'rev-1' });
  const requests = mockApi((request) => {
    if (request.path === '/tree') return { body: { root: sampleTree() } };
    const custom = extra(request);
    if (custom) return custom;
    if (request.path === `/documents/${ID}` && request.method === 'GET') return { body: current };
    if (request.path === `/documents/${ID}` && request.method === 'PUT') {
      const result = onPut(request);
      if (result?.status === undefined || result.status < 400)
        current = result?.body as typeof current;
      return result;
    }
    return undefined;
  });
  return requests;
}

const saved = (request: MockRequest, revision = 'rev-2') => ({
  body: documentDto(ID, PATH, { content: (request.body as { content: string }).content, revision }),
});

describe('editing a document (Phase 5)', () => {
  beforeEach(() => window.localStorage.setItem('leandocs.editor.mode', JSON.stringify('source')));
  it('opens the source editor from the Edit tab without leaving the page layout', async () => {
    api((request) => saved(request));
    const { user, location } = renderApp(`/doc/${ID}`);
    await screen.findByRole('heading', { level: 1, name: 'BUZHULK' });
    await user.click(screen.getByRole('tab', { name: 'Edit' }));
    await waitFor(() => expect(location()).toBe(`/doc/${ID}/edit`));
    expect(await screen.findByTestId('source-editor')).toBeInTheDocument();
    expect(editorView().state.doc.toString()).toBe('# BUZHULK\n\nHello\n');
    expect(screen.getByRole('heading', { level: 1, name: 'BUZHULK' })).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Save status' })).toHaveTextContent('Saved');
  });

  it('marks changes as unsaved and saves with Ctrl+S using the expected revision', async () => {
    const requests = api((request) => saved(request));
    const { user } = renderApp(`/doc/${ID}/edit`);
    await screen.findByTestId('source-editor');
    type('More text\n');
    expect(screen.getByRole('status', { name: 'Save status' })).toHaveTextContent('Unsaved');
    editorView().focus();
    await user.keyboard('{Control>}s{/Control}');
    await waitFor(() =>
      expect(screen.getByRole('status', { name: 'Save status' })).toHaveTextContent('Saved'),
    );
    const put = requests.find((request) => request.method === 'PUT');
    expect(put?.body).toEqual({
      content: '# BUZHULK\n\nHello\nMore text\n',
      expectedRevision: 'rev-1',
    });
  });

  it('Done saves pending changes and returns to the view', async () => {
    const requests = api((request) => saved(request));
    const { user, location } = renderApp(`/doc/${ID}/edit`);
    await screen.findByTestId('source-editor');
    type('Done text\n');
    await user.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(location()).toBe(`/doc/${ID}`));
    expect(requests.filter((request) => request.method === 'PUT')).toHaveLength(1);
  });

  it('shows a save error that can be retried', async () => {
    let fail = true;
    api((request) => {
      if (fail)
        return {
          status: 500,
          body: { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
        };
      return saved(request);
    });
    const { user } = renderApp(`/doc/${ID}/edit`);
    await screen.findByTestId('source-editor');
    type('x');
    editorView().focus();
    await user.keyboard('{Control>}s{/Control}');
    const failed = await screen.findByRole('button', { name: /Save failed/ });
    fail = false;
    await user.click(failed);
    await waitFor(() =>
      expect(screen.getByRole('status', { name: 'Save status' })).toHaveTextContent('Saved'),
    );
  });

  describe('conflicts (UI_SPEC §69)', () => {
    const conflictPut = () => ({
      status: 409,
      body: {
        error: {
          code: 'DOCUMENT_CONFLICT',
          message: 'Document has changed',
          details: { currentRevision: 'rev-disk' },
        },
      },
    });

    it('opens the conflict dialog and reloads the disk version', async () => {
      let diskVersion = false;
      api(conflictPut, (request) =>
        diskVersion && request.method === 'GET' && request.path === `/documents/${ID}`
          ? {
              body: documentDto(ID, PATH, {
                content: '# BUZHULK\n\nChanged in VS Code\n',
                revision: 'rev-disk',
              }),
            }
          : undefined,
      );
      const { user } = renderApp(`/doc/${ID}/edit`);
      await screen.findByTestId('source-editor');
      diskVersion = true;
      type('mine\n');
      editorView().focus();
      await user.keyboard('{Control>}s{/Control}');
      const dialog = await screen.findByRole('dialog', {
        name: 'Document changed outside the editor',
      });
      expect(within(dialog).queryByRole('button', { name: /overwrite/i })).not.toBeInTheDocument();
      await user.click(within(dialog).getByRole('button', { name: 'Reload from disk' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      await waitFor(() =>
        expect(editorView().state.doc.toString()).toBe('# BUZHULK\n\nChanged in VS Code\n'),
      );
      expect(screen.getByRole('status', { name: 'Save status' })).toHaveTextContent('Saved');
    });

    it('shows the differences and saves my version as a copy', async () => {
      const requests = api(conflictPut, (request) => {
        if (request.method === 'POST' && request.path === '/documents') {
          return {
            status: 201,
            body: documentDto('id-copy', 'Infrastructure/Servers/BUZHULK (conflict copy).md'),
          };
        }
        if (request.path === '/documents/id-copy') {
          return {
            body: documentDto('id-copy', 'Infrastructure/Servers/BUZHULK (conflict copy).md'),
          };
        }
        return undefined;
      });
      const { user, location } = renderApp(`/doc/${ID}/edit`);
      await screen.findByTestId('source-editor');
      type('mine\n');
      editorView().focus();
      await user.keyboard('{Control>}s{/Control}');
      const dialog = await screen.findByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: 'Review changes' }));
      const review = await screen.findByRole('dialog', { name: 'Review changes' });
      expect(within(review).getByLabelText('Differences')).toHaveTextContent('+ mine');
      await user.click(within(review).getByRole('button', { name: 'Back' }));
      await user.click(screen.getByRole('button', { name: 'Save as copy' }));
      await waitFor(() => expect(location()).toBe('/doc/id-copy/edit'));
      const post = requests.find((request) => request.method === 'POST')?.body as Record<
        string,
        string
      >;
      expect(post.name).toMatch(/^BUZHULK \(conflict copy \d{4}-\d\d-\d\d \d{4}\)$/);
      expect(post.folder).toBe('Infrastructure/Servers');
      expect(post.content).toBe('# BUZHULK\n\nHello\nmine\n');
    });

    it('Cancel keeps the conflict state visible and it can be reopened', async () => {
      api(conflictPut);
      const { user } = renderApp(`/doc/${ID}/edit`);
      await screen.findByTestId('source-editor');
      type('mine\n');
      editorView().focus();
      await user.keyboard('{Control>}s{/Control}');
      const dialog = await screen.findByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      await user.click(screen.getByRole('button', { name: /Conflict/ }));
      expect(await screen.findByRole('dialog')).toBeInTheDocument();
    });
  });

  describe('local drafts (PROJECT_SPEC §47)', () => {
    const draft = {
      content: '# BUZHULK\n\nUnsaved draft\n',
      baseRevision: 'rev-1',
      updatedAt: new Date().toISOString(),
    };

    it('offers to continue editing from the view', async () => {
      window.localStorage.setItem(`leandocs.draft.${ID}`, JSON.stringify(draft));
      api((request) => saved(request));
      const { user, location } = renderApp(`/doc/${ID}`);
      const notice = await screen.findByRole('region', { name: 'Unsaved local changes' });
      await user.click(within(notice).getByRole('button', { name: 'Continue editing' }));
      await waitFor(() => expect(location()).toBe(`/doc/${ID}/edit`));
    });

    it('restores the draft into the editor, or discards it', async () => {
      window.localStorage.setItem(`leandocs.draft.${ID}`, JSON.stringify(draft));
      api((request) => saved(request));
      const { user } = renderApp(`/doc/${ID}/edit`);
      const notice = await screen.findByRole('region', { name: 'Unsaved local changes' });
      await user.click(within(notice).getByRole('button', { name: 'Restore' }));
      await waitFor(() => expect(editorView().state.doc.toString()).toBe(draft.content));
      expect(screen.getByRole('status', { name: 'Save status' })).toHaveTextContent('Unsaved');
    });

    it('ignores drafts identical to the saved document', async () => {
      window.localStorage.setItem(
        `leandocs.draft.${ID}`,
        JSON.stringify({ ...draft, content: '# BUZHULK\n\nHello\n' }),
      );
      api((request) => saved(request));
      renderApp(`/doc/${ID}`);
      await screen.findByRole('heading', { level: 1 });
      expect(
        screen.queryByRole('region', { name: 'Unsaved local changes' }),
      ).not.toBeInTheDocument();
    });
  });
});
