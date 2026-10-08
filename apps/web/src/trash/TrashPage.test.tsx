import { screen, waitFor, within } from '@testing-library/react';
import type { TrashItem } from '@leandocs/shared';
import { describe, expect, it } from 'vitest';
import { mockApi, renderApp, sampleTree, type MockRequest } from '../test/render';

/** P16-04: Trash view (UI_SPEC §136). */

const trashedDoc: TrashItem = {
  trashId: '20261008T100000Z-aaaa1111',
  kind: 'document',
  name: 'Old Server.md',
  originalPath: 'Infrastructure/Servers/Old Server.md',
  deletedAt: new Date(Date.now() - 2 * 3600_000).toISOString(),
  documentId: 'id-old',
  title: 'Old Server',
};
const folder: TrashItem = {
  trashId: '20261007T100000Z-bbbb2222',
  kind: 'folder',
  name: 'Archive',
  originalPath: 'Archive',
  deletedAt: new Date(Date.now() - 3 * 86_400_000).toISOString(),
};

type Handler = (request: MockRequest) => { status?: number; body?: unknown } | undefined;

function api(items: TrashItem[], extra: Handler = () => undefined) {
  let trash = [...items];
  return mockApi((request) => {
    const custom = extra(request);
    if (custom) return custom;
    if (request.path === '/tree') return { body: { root: sampleTree() } };
    if (request.path === '/pins') return { body: { items: [] } };
    if (request.method === 'GET' && request.path === '/trash') return { body: { items: trash } };
    if (request.method === 'DELETE' && request.path === '/trash') {
      const deleted = trash.length;
      trash = [];
      return { body: { deleted } };
    }
    const item = trash.find((entry) => request.path.startsWith(`/trash/${entry.trashId}`));
    if (!item) return undefined;
    trash = trash.filter((entry) => entry !== item);
    if (request.method === 'DELETE') return { status: 204 };
    return {
      body: { kind: item.kind, path: item.originalPath, documentId: item.documentId },
    };
  });
}

const rows = () => screen.getAllByRole('row').slice(1);

describe('Trash', () => {
  it('is opened from the navigation and lists name, original location and deletion time', async () => {
    api([trashedDoc, folder]);
    const { user, location } = renderApp('/');
    await user.click(await screen.findByRole('link', { name: 'Trash' }));
    expect(location()).toBe('/trash');
    expect(await screen.findByRole('heading', { level: 1, name: 'Trash' })).toBeInTheDocument();
    expect(document.title).toBe('Trash — LeanDocs');
    expect(screen.getByRole('link', { name: 'Trash' })).toHaveAttribute('aria-current', 'page');

    expect(
      within(screen.getAllByRole('row')[0]!)
        .getAllByRole('columnheader')
        .map((cell) => cell.textContent),
    ).toEqual(['Name', 'Original location', 'Deleted', 'Actions']);
    const [first, second] = rows();
    expect(within(first!).getByRole('rowheader')).toHaveTextContent('Old Server');
    expect(first).toHaveTextContent('Infrastructure / Servers');
    expect(first).toHaveTextContent('2 hours ago');
    expect(within(second!).getByRole('rowheader')).toHaveTextContent('Archive');
    expect(within(second!).getByRole('img', { name: 'Folder' })).toBeInTheDocument();
    expect(second).toHaveTextContent('Documentation');
  });

  it('restores an item and offers to open a restored document', async () => {
    const requests = api([trashedDoc, folder]);
    const { user, location } = renderApp('/trash');
    await user.click(await screen.findByRole('button', { name: 'Restore Old Server' }));

    await screen.findByText('"Old Server" restored to Infrastructure / Servers');
    expect(requests).toContainEqual(
      expect.objectContaining({ method: 'POST', path: `/trash/${trashedDoc.trashId}/restore` }),
    );
    await waitFor(() => expect(rows()).toHaveLength(1));
    await user.click(screen.getByRole('button', { name: 'Open' }));
    await waitFor(() => expect(location()).toBe('/doc/id-old'));
  });

  it('shows why an item cannot be restored and keeps it in the trash', async () => {
    api([trashedDoc], (request) =>
      request.method === 'POST'
        ? {
            status: 409,
            body: {
              error: {
                code: 'RESTORE_CONFLICT',
                message: 'Something named "Old Server.md" already exists at the original location',
              },
            },
          }
        : undefined,
    );
    const { user } = renderApp('/trash');
    await user.click(await screen.findByRole('button', { name: 'Restore Old Server' }));
    expect(
      await screen.findByText(
        'Something named "Old Server.md" already exists at the original location',
      ),
    ).toBeInTheDocument();
    expect(rows()).toHaveLength(1);
  });

  it('deletes one item permanently only after confirming', async () => {
    const requests = api([trashedDoc, folder]);
    const { user } = renderApp('/trash');
    await user.click(await screen.findByRole('button', { name: 'Delete permanently Archive' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete permanently?' });
    expect(dialog).toHaveTextContent('Archive and everything in it will be deleted from disk.');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(requests.some((request) => request.method === 'DELETE')).toBe(false);

    await user.click(screen.getByRole('button', { name: 'Delete permanently Archive' }));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete permanently' }),
    );
    expect(await screen.findByText('"Archive" deleted permanently')).toBeInTheDocument();
    expect(requests).toContainEqual(
      expect.objectContaining({ method: 'DELETE', path: `/trash/${folder.trashId}` }),
    );
    await waitFor(() => expect(rows()).toHaveLength(1));
  });

  it('empties the trash after confirming and then shows the empty state', async () => {
    api([trashedDoc, folder]);
    const { user } = renderApp('/trash');
    await user.click(await screen.findByRole('button', { name: 'Empty trash' }));
    const dialog = screen.getByRole('dialog', { name: 'Empty trash?' });
    expect(dialog).toHaveTextContent('All 2 items in the trash will be deleted from disk.');
    await user.click(within(dialog).getByRole('button', { name: 'Empty trash' }));
    expect(await screen.findByText('2 items deleted permanently')).toBeInTheDocument();
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Trash is empty' }),
    ).toBeInTheDocument();
  });
});
