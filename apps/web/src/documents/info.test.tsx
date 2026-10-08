import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { documentDto, mockApi, renderApp, sampleTree, type MockRequest } from '../test/render';

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

const doc = documentDto('id-vlan', 'Network/VLAN.md', {
  title: 'VLAN',
  frontmatter: { id: 'id-vlan', title: 'VLAN', tags: ['network'], aliases: ['vlans'] },
  created: '2026-09-27T10:00:00Z',
  updated: '2026-10-02T10:00:00Z',
});

function api(onPost: (request: MockRequest) => unknown = () => undefined) {
  return mockApi((request) => {
    if (request.path === '/tree') return { body: { root: sampleTree() } };
    if (request.path === '/documents/id-vlan') return { body: doc };
    if (request.path === '/documents/id-vlan/attachments') return { body: { items: [] } };
    if (request.path === '/tags')
      return {
        body: {
          items: [
            { name: 'network', count: 3 },
            { name: 'docker', count: 2 },
          ],
        },
      };
    if (request.path.startsWith('/search?')) return { body: { query: '', results: [] } };
    if (request.method === 'POST' && request.path === '/documents/id-vlan/properties')
      return { body: onPost(request) };
    return undefined;
  });
}

describe('Info tab (P10-04)', () => {
  it('shows path and dates and saves changed properties only', async () => {
    const requests = api((request) => ({
      ...doc,
      revision: 'sha256:new',
      frontmatter: { ...doc.frontmatter, tags: (request.body as { tags: string[] }).tags },
    }));
    const { user } = renderApp('/doc/id-vlan');
    await user.click(await screen.findByRole('tab', { name: 'Info' }));
    const form = await screen.findByRole('form', { name: 'Properties' });
    expect(form).toHaveTextContent('Network/VLAN.md');
    expect(form).toHaveTextContent('27 Sept 2026');
    const save = within(form).getByRole('button', { name: 'Save properties' });
    expect(save).toBeDisabled();

    const tagsInput = within(form).getByLabelText('Tags');
    await user.type(tagsInput, 'docker{Enter}');
    await user.click(within(form).getByRole('button', { name: 'Remove network' }));
    await user.click(save);
    await waitFor(() =>
      expect(requests.find((r) => r.method === 'POST')?.body).toEqual({
        expectedRevision: 'sha256:abc',
        tags: ['docker'],
      }),
    );
    expect(await screen.findByText('Properties saved.')).toBeInTheDocument();
  });

  it('is read-only while editing', async () => {
    api();
    const { user } = renderApp('/doc/id-vlan/edit');
    await user.click(await screen.findByRole('tab', { name: 'Info' }));
    const form = await screen.findByRole('form', { name: 'Properties' });
    expect(within(form).getByLabelText('Title')).toBeDisabled();
    expect(within(form).queryByRole('button', { name: 'Save properties' })).toBeNull();
    expect(form).toHaveTextContent('Finish editing (Done) to change properties here.');
  });
});

describe('tag filter (P10-03)', () => {
  it('clicking a tag opens search filtered by it', async () => {
    api();
    const { user } = renderApp('/doc/id-vlan');
    await user.click(await screen.findByRole('button', { name: 'network' }));
    expect(await screen.findByRole('combobox', { name: 'Search documentation' })).toHaveValue(
      'tag:network ',
    );
  });
});
