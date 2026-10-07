import { screen, waitFor, within } from '@testing-library/react';
import { EditorView } from '@codemirror/view';
import { getIndentUnit } from '@codemirror/language';
import { describe, expect, it } from 'vitest';
import {
  documentDto,
  mockApi,
  renderApp,
  sampleTree,
  setTestSettings,
  type MockRequest,
} from '../test/render';

/** P16-01: General and Editor settings (UI_SPEC §81–83). */

const ID = 'id-buzhulk';
const PATH = 'Infrastructure/Servers/BUZHULK.md';

type Handler = (request: MockRequest) => { status?: number; body?: unknown } | undefined;

function api(extra: Handler = () => undefined) {
  return mockApi((request) => {
    const custom = extra(request);
    if (custom) return custom;
    if (request.path === '/tree') return { body: { root: sampleTree() } };
    if (request.path === '/documents/recent?limit=10') return { body: { items: [] } };
    if (request.path === '/pins') return { body: { items: [] } };
    if (request.path === `/documents/${ID}`) return { body: documentDto(ID, PATH) };
    return undefined;
  });
}

const patches = (requests: MockRequest[]) =>
  requests.filter((request) => request.method === 'PATCH').map((request) => request.body);

function sourceView(): EditorView {
  const dom = screen.getByTestId('source-editor').querySelector('.cm-editor');
  const view = dom && EditorView.findFromDOM(dom as HTMLElement);
  if (!view) throw new Error('CodeMirror view not found');
  return view;
}

describe('Settings › General', () => {
  it('opens by default and saves each change at once', async () => {
    const requests = api();
    const { user, location } = renderApp('/settings');
    await waitFor(() => expect(location()).toBe('/settings/general'));
    const nav = screen.getByRole('navigation', { name: 'Settings' });
    expect(
      within(nav)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['General', 'Editor', 'Security', 'Storage', 'Index', 'Broken links', 'About']);

    const openLast = await screen.findByRole('checkbox', { name: 'Open last document on startup' });
    expect(openLast).not.toBeChecked();
    await user.click(openLast);
    expect(openLast).toBeChecked();

    const location_ = screen.getByRole('combobox', { name: 'Default location for new documents' });
    await waitFor(() =>
      expect(
        within(location_)
          .getAllByRole('option')
          .map((option) => option.textContent),
      ).toEqual(['Documentation', 'Infrastructure', 'Infrastructure / Servers', 'Network']),
    );
    await user.selectOptions(location_, 'Infrastructure/Servers');

    await user.click(screen.getByRole('checkbox', { name: 'Autosave' }));
    await waitFor(() =>
      expect(patches(requests)).toEqual([
        { general: { openLastDocument: true } },
        { general: { newDocumentFolder: 'Infrastructure/Servers' } },
        { general: { autosave: false } },
      ]),
    );
  });

  it('shows a folder that no longer exists', async () => {
    api();
    setTestSettings({ general: { newDocumentFolder: 'Archive' } });
    renderApp('/settings/general');
    const select = await screen.findByRole('combobox', {
      name: 'Default location for new documents',
    });
    await waitFor(() => expect(select).toHaveDisplayValue('Archive (missing)'));
    expect(screen.getByText(/This folder no longer exists/)).toBeInTheDocument();
  });

  it('puts the stored value back when saving fails', async () => {
    api((request) =>
      request.method === 'PATCH'
        ? { status: 500, body: { error: { code: 'INTERNAL_ERROR', message: 'Disk full' } } }
        : undefined,
    );
    const { user } = renderApp('/settings/general');
    const autosave = await screen.findByRole('checkbox', { name: 'Autosave' });
    await user.click(autosave);
    expect(await screen.findByRole('alert')).toHaveTextContent('Not saved: Disk full');
    expect(autosave).toBeChecked();
  });
});

describe('Settings › Editor', () => {
  it('saves editor options; the delay is unavailable while autosave is off', async () => {
    const requests = api();
    const { user } = renderApp('/settings/editor');
    await user.selectOptions(
      await screen.findByRole('combobox', { name: 'Default editor' }),
      'source',
    );
    await user.selectOptions(screen.getByRole('combobox', { name: 'Autosave delay' }), '3000');
    await user.click(screen.getByRole('checkbox', { name: 'Show line numbers' }));
    await user.click(screen.getByRole('checkbox', { name: 'Word wrap' }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Tab size' }), '4');
    await waitFor(() =>
      expect(patches(requests)).toEqual([
        { editor: { defaultMode: 'source' } },
        { editor: { autosaveDelay: 3000 } },
        { editor: { lineNumbers: false } },
        { editor: { wordWrap: false } },
        { editor: { tabSize: 4 } },
      ]),
    );

    await user.click(screen.getByRole('link', { name: 'General' }));
    await user.click(await screen.findByRole('checkbox', { name: 'Autosave' }));
    await user.click(screen.getByRole('link', { name: 'Editor' }));
    expect(await screen.findByRole('combobox', { name: 'Autosave delay' })).toBeDisabled();
  });

  it('the source editor uses line numbers, word wrap and tab size from the settings', async () => {
    api();
    setTestSettings({
      editor: { defaultMode: 'source', lineNumbers: false, wordWrap: false, tabSize: 4 },
    });
    renderApp(`/doc/${ID}/edit`);
    await screen.findByTestId('source-editor');
    const view = sourceView();
    expect(view.state.tabSize).toBe(4);
    expect(getIndentUnit(view.state)).toBe(4);
    expect(view.lineWrapping).toBe(false);
    expect(view.dom.querySelector('.cm-lineNumbers')).toBeNull();
  });

  it('defaults: line numbers, word wrap and two-space indentation', async () => {
    api();
    setTestSettings({ editor: { defaultMode: 'source' } });
    renderApp(`/doc/${ID}/edit`);
    await screen.findByTestId('source-editor');
    const view = sourceView();
    expect(getIndentUnit(view.state)).toBe(2);
    expect(view.lineWrapping).toBe(true);
    expect(view.dom.querySelector('.cm-lineNumbers')).not.toBeNull();
  });
});

describe('default location for new documents', () => {
  it('is preselected for a new document from the home page', async () => {
    api();
    setTestSettings({ general: { newDocumentFolder: 'Network' } });
    const { user } = renderApp('/');
    await user.click(await screen.findByRole('button', { name: 'New document' }));
    const dialog = await screen.findByRole('dialog', { name: 'New document' });
    expect(within(dialog).getByRole('combobox', { name: 'Location' })).toHaveValue('Network');
  });

  it('is not used while a document is open: the new document goes next to it', async () => {
    api();
    setTestSettings({ general: { newDocumentFolder: 'Network' } });
    const { user } = renderApp(`/doc/${ID}`);
    await screen.findByRole('heading', { level: 1, name: 'BUZHULK' });
    await user.click(screen.getByRole('button', { name: 'New' }));
    const dialog = await screen.findByRole('dialog', { name: 'New document' });
    expect(within(dialog).getByRole('combobox', { name: 'Location' })).toHaveValue(
      'Infrastructure/Servers',
    );
  });

  it('falls back to the top level when the folder is gone', async () => {
    api();
    setTestSettings({ general: { newDocumentFolder: 'Archive' } });
    const { user } = renderApp('/');
    await user.click(await screen.findByRole('button', { name: 'New document' }));
    const dialog = await screen.findByRole('dialog', { name: 'New document' });
    expect(within(dialog).getByRole('combobox', { name: 'Location' })).toHaveValue('');
  });
});

describe('open last document on startup', () => {
  it('opens the document viewed last when the app starts on the home page', async () => {
    api();
    setTestSettings({ general: { openLastDocument: true } });
    window.localStorage.setItem('leandocs.lastDocument', JSON.stringify(ID));
    const { location } = renderApp('/');
    await waitFor(() => expect(location()).toBe(`/doc/${ID}`));
  });

  it('remembers the document viewed last', async () => {
    api();
    const { location } = renderApp(`/doc/${ID}`);
    await screen.findByRole('heading', { level: 1, name: 'BUZHULK' });
    expect(window.localStorage.getItem('leandocs.lastDocument')).toBe(JSON.stringify(ID));
    expect(location()).toBe(`/doc/${ID}`);
  });

  it('stays home when the setting is off', async () => {
    const requests = api();
    window.localStorage.setItem('leandocs.lastDocument', JSON.stringify(ID));
    const { location } = renderApp('/');
    await screen.findByRole('heading', { level: 1, name: 'Documentation' });
    await waitFor(() => expect(requests.some((r) => r.path === '/settings')).toBe(true));
    expect(location()).toBe('/');
  });

  it('forgets a document that no longer exists and stays home', async () => {
    api((request) =>
      request.path === '/documents/gone'
        ? { status: 404, body: { error: { code: 'DOCUMENT_NOT_FOUND', message: 'Not found' } } }
        : undefined,
    );
    setTestSettings({ general: { openLastDocument: true } });
    window.localStorage.setItem('leandocs.lastDocument', JSON.stringify('gone'));
    const { location } = renderApp('/');
    await waitFor(() => expect(window.localStorage.getItem('leandocs.lastDocument')).toBe('null'));
    expect(location()).toBe('/');
  });
});
