import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { documentDto, mockApi, renderApp, sampleTree } from '../test/render';

const recent = { items: [] };

describe('content actions', () => {
  it('creates a document in the folder of the open document and opens it', async () => {
    const requests = mockApi((request) => {
      if (request.path === '/tree') return { body: { root: sampleTree() } };
      if (request.method === 'POST' && request.path === '/documents') {
        return { status: 201, body: documentDto('id-new', 'Infrastructure/Servers/Synology.md') };
      }
      if (/^\/documents\/id-[^/]+\/attachments$/.test(request.path)) return { body: { items: [] } };
      if (/^\/documents\/id-[^/]+$/.test(request.path)) {
        const id = request.path.split('/')[2]!;
        return { body: documentDto(id, `Infrastructure/Servers/${id}.md`) };
      }
      return undefined;
    });
    const { user, location } = renderApp('/doc/id-buzhulk');
    await screen.findByRole('heading', { level: 1 });
    await user.click(screen.getByRole('button', { name: 'New' }));
    const dialog = await screen.findByRole('dialog', { name: 'New document' });
    expect(within(dialog).getByLabelText('Location')).toHaveValue('Infrastructure/Servers');
    await user.type(within(dialog).getByLabelText('Name'), 'Synology');
    await user.click(within(dialog).getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(location()).toBe('/doc/id-new/edit'));
    expect(requests.find((r) => r.method === 'POST')?.body).toEqual({
      name: 'Synology',
      folder: 'Infrastructure/Servers',
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('creates a document from a template (P10-02)', async () => {
    const requests = mockApi((request) => {
      if (request.path === '/tree') return { body: { root: sampleTree() } };
      if (request.path === '/documents/recent?limit=10') return { body: recent };
      if (request.path === '/templates')
        return { body: { items: [{ name: 'Application' }, { name: 'Server' }] } };
      if (request.method === 'POST' && request.path === '/documents')
        return { status: 201, body: documentDto('id-new', 'BUZHULK.md') };
      if (/^\/documents\/id-new/.test(request.path))
        return {
          body: request.path.endsWith('attachments')
            ? { items: [] }
            : documentDto('id-new', 'BUZHULK.md'),
        };
      return undefined;
    });
    const { user, location } = renderApp('/');
    await user.click(await screen.findByRole('button', { name: 'New' }));
    const dialog = await screen.findByRole('dialog', { name: 'New document' });
    await user.type(within(dialog).getByLabelText('Name'), 'BUZHULK');
    const select = within(dialog).getByLabelText('Template');
    await waitFor(() => expect(within(select).getAllByRole('option')).toHaveLength(3));
    expect(
      within(select)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Blank', 'Application', 'Server']);
    await user.selectOptions(select, 'Server');
    await user.click(within(dialog).getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(location()).toBe('/doc/id-new/edit'));
    expect(requests.find((r) => r.method === 'POST')?.body).toEqual({
      name: 'BUZHULK',
      folder: '',
      template: 'Server',
    });
  });

  it('shows server errors inside the dialog', async () => {
    mockApi((request) => {
      if (request.path === '/tree') return { body: { root: sampleTree() } };
      if (request.path === '/documents/recent?limit=10') return { body: recent };
      if (request.method === 'POST') {
        return {
          status: 409,
          body: {
            error: {
              code: 'DOCUMENT_EXISTS',
              message: '"README.md" already exists in the target folder',
            },
          },
        };
      }
      return undefined;
    });
    const { user } = renderApp('/');
    await screen.findByRole('tree');
    await user.click(screen.getByRole('button', { name: 'New' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Name'), 'README');
    await user.click(within(dialog).getByRole('button', { name: 'Create' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('already exists');
  });

  it('renames via F2 and only sends the title when it changed', async () => {
    const requests = mockApi((request) => {
      if (request.path === '/tree') return { body: { root: sampleTree() } };
      if (request.path === '/documents/recent?limit=10') return { body: recent };
      if (request.path === '/documents/id-readme/rename') {
        return { body: documentDto('id-readme', 'Overview.md') };
      }
      return undefined;
    });
    const { user } = renderApp('/');
    const item = await screen.findByRole('treeitem', { name: /Read me/ });
    item.focus();
    await user.keyboard('{F2}');
    const dialog = await screen.findByRole('dialog', { name: 'Rename document' });
    const name = within(dialog).getByLabelText('File name');
    expect(name).toHaveValue('README');
    expect(within(dialog).getByLabelText('Title')).toHaveValue('Read me');
    await user.clear(name);
    await user.type(name, 'Overview');
    await user.click(within(dialog).getByRole('button', { name: 'Rename' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(requests.find((r) => r.path.endsWith('/rename'))?.body).toEqual({ name: 'Overview' });
  });

  it('moves to trash with confirmation and offers Undo', async () => {
    const requests = mockApi((request) => {
      if (request.path === '/tree') return { body: { root: sampleTree() } };
      if (request.path === '/documents/recent?limit=10') return { body: recent };
      if (request.method === 'DELETE' && request.path === '/documents/id-readme') {
        return {
          body: {
            trashId: '20261002T120000Z-0a1b2c3d',
            kind: 'document',
            name: 'README.md',
            originalPath: 'README.md',
            deletedAt: '2026-10-02T12:00:00Z',
          },
        };
      }
      if (request.path === '/trash/20261002T120000Z-0a1b2c3d/restore') {
        return { body: { kind: 'document', path: 'README.md', documentId: 'id-readme' } };
      }
      if (request.path === '/documents/id-readme')
        return { body: documentDto('id-readme', 'README.md') };
      return undefined;
    });
    const { user, location } = renderApp('/');
    const item = await screen.findByRole('treeitem', { name: /Read me/ });
    item.focus();
    await user.keyboard('{Delete}');
    const dialog = await screen.findByRole('dialog', { name: 'Move document to trash?' });
    expect(dialog).toHaveTextContent('can be restored');
    await user.click(within(dialog).getByRole('button', { name: 'Move to Trash' }));

    expect(await screen.findByText('"Read me" moved to Trash')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() =>
      expect(requests.some((r) => r.path === '/trash/20261002T120000Z-0a1b2c3d/restore')).toBe(
        true,
      ),
    );
    await waitFor(() => expect(location()).toBe('/doc/id-readme'));
  });

  it('moves a folder with the folder picker and disables invalid targets', async () => {
    const requests = mockApi((request) => {
      if (request.path === '/tree') return { body: { root: sampleTree() } };
      if (request.path === '/documents/recent?limit=10') return { body: recent };
      if (request.path === '/folders/move')
        return { body: { path: 'Network/Infrastructure', name: 'Infrastructure' } };
      return undefined;
    });
    const { user } = renderApp('/');
    const item = await screen.findByRole('treeitem', { name: /Infrastructure/ });
    await user.pointer({ keys: '[MouseRight]', target: item });
    await user.click(await screen.findByRole('menuitem', { name: 'Move' }));
    const dialog = await screen.findByRole('dialog', { name: 'Move "Infrastructure"' });
    const options = within(dialog).getAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual([
      'Documentationcurrent',
      'Infrastructure',
      'Network',
    ]);
    expect(options[1]).toHaveAttribute('aria-disabled', 'true');
    expect(within(dialog).getByRole('button', { name: 'Move' })).toBeDisabled();
    await user.click(options[2]!);
    await user.click(within(dialog).getByRole('button', { name: 'Move' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(requests.find((r) => r.path === '/folders/move')?.body).toEqual({
      path: 'Infrastructure',
      targetFolder: 'Network',
    });
  });
});
