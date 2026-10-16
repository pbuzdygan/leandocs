import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AttachmentDto } from '@leandocs/shared';
import { describeUses, missingAttachments } from '../attachments/missing';
import { renderMarkdown } from '../markdown/pipeline';
import { documentDto, mockApi, renderApp, sampleTree } from '../test/render';

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

const content = [
  'See [the manual](ATLAS.assets/manual.pdf) and [again](ATLAS.assets/manual.pdf).',
  '',
  '![Rack diagram](ATLAS.assets/rack.png)',
  '',
  '[Config](ATLAS.assets/kept.yaml) and [ORION notes](ORION.assets/notes.txt).',
  '',
].join('\n');

function attachment(name: string): AttachmentDto {
  return {
    name,
    size: 10,
    mime: 'text/plain',
    image: false,
    markdownUrl: `ATLAS.assets/${name}`,
    url: `/api/v1/documents/id-atlas/attachments/${name}`,
  };
}

/** ATLAS with `files` attached; DELETE removes one, as the server would. */
function api(text: string, files: string[]) {
  let attached = [...files];
  return mockApi((request) => {
    if (request.path === '/tree') return { body: { root: sampleTree() } };
    if (request.path === '/documents/id-atlas')
      return {
        body: documentDto('id-atlas', 'Infrastructure/Servers/ATLAS.md', { content: text }),
      };
    if (request.path === '/documents/id-atlas/attachments')
      return { body: { items: attached.map(attachment) } };
    if (
      request.method === 'DELETE' &&
      request.path.startsWith('/documents/id-atlas/attachments/')
    ) {
      const name = decodeURIComponent(request.path.split('/').pop()!);
      attached = attached.filter((file) => file !== name);
      return { status: 204 };
    }
    if (request.path === '/documents/id-atlas/links') return { body: { items: [] } };
    if (request.path === '/documents/id-atlas/backlinks') return { body: { items: [] } };
    return undefined;
  });
}

async function openLinks() {
  const app = renderApp('/doc/id-atlas');
  await app.user.click(await screen.findByRole('tab', { name: 'Links' }));
  return app;
}

describe('missing attachments', () => {
  it('collects only the current document’s files, counted per kind', () => {
    const { attachmentRefs } = renderMarkdown(content, {
      documentPath: 'Infrastructure/Servers/ATLAS.md',
      documents: [
        { id: 'id-atlas', title: 'ATLAS', path: 'Infrastructure/Servers/ATLAS.md' },
        { id: 'id-orion', title: 'ORION', path: 'Infrastructure/Servers/ORION.md' },
      ],
    });
    expect(attachmentRefs).toHaveLength(5);
    const missing = missingAttachments(attachmentRefs, 'id-atlas', ['kept.yaml']);
    expect(missing).toEqual([
      { name: 'manual.pdf', links: 2, images: 0 },
      { name: 'rack.png', links: 0, images: 1 },
    ]);
    expect(missing.map(describeUses)).toEqual(['2 links', 'image']);
    expect(describeUses({ name: 'x', links: 1, images: 3 })).toBe('link · 3 images');
  });
});

describe('Missing files in the Links tab', () => {
  it('lists linked files that are not attached and shows where they are', async () => {
    api(content, ['kept.yaml']);
    const { user } = await openLinks();
    const section = await screen.findByRole('region', { name: 'Missing files' });
    const manual = await within(section).findByRole('button', { name: 'manual.pdf' });
    expect(manual.closest('li')).toHaveTextContent('Not found · 2 links');
    expect(
      within(section).getByRole('button', { name: 'rack.png' }).closest('li'),
    ).toHaveTextContent('Not found · image');
    // Attached, or another document's file: not listed.
    expect(section).not.toHaveTextContent('kept.yaml');
    expect(section).not.toHaveTextContent('notes.txt');

    await user.click(manual);
    const first = screen.getByRole('link', { name: 'the manual' });
    expect(first).toHaveClass('attachment-highlight');
    expect(first).toHaveFocus();
  });

  it('updates when a linked file is deleted below the document', async () => {
    api(content, ['manual.pdf', 'rack.png', 'kept.yaml']);
    const { user } = await openLinks();
    const section = await screen.findByRole('region', { name: 'Missing files' });
    expect(await within(section).findByText('All linked files are attached.')).toBeInTheDocument();

    const attachments = screen.getByRole('region', { name: 'Attachments' });
    await user.click(within(attachments).getByText(/^Attachments/));
    const rack = within(attachments).getByText('rack.png').closest('li')!;
    await user.click(within(rack as HTMLElement).getByRole('button', { name: 'Delete' }));
    await user.click(await screen.findByRole('button', { name: 'Delete permanently' }));

    await waitFor(() =>
      expect(within(section).getByRole('button', { name: 'rack.png' })).toBeInTheDocument(),
    );
  });

  it('is left out when the document links to none of its files', async () => {
    api('No files here, only [ORION notes](ORION.assets/notes.txt).\n', []);
    await openLinks();
    expect(await screen.findByRole('region', { name: 'Links to' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Missing files' })).not.toBeInTheDocument();
  });
});
