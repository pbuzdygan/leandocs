import { screen, waitFor, within } from '@testing-library/react';
import { IMPORT_NAME_ONLY_TYPE, type ImportReport } from '@leandocs/shared';
import { describe, expect, it } from 'vitest';
import { documentDto, folder, mockApi, renderApp, sampleTree } from '../test/render';

function file(path: string, content: string) {
  const result = new File([content], path.split('/').pop()!, { type: 'text/markdown' });
  Object.defineProperty(result, 'webkitRelativePath', { value: path });
  return result;
}

function report(dryRun: boolean, destination = ''): ImportReport {
  return {
    importer: 'markdown-directory',
    destination,
    dryRun,
    items: [
      {
        source: 'Notes/Plain.md',
        destination: 'Notes/Plain.md',
        status: dryRun ? 'ready' : 'imported',
        documentId: dryRun ? undefined : 'id-plain',
        notes: ['Adds missing front matter: id, title, created, updated'],
        warnings: [],
      },
      {
        source: 'Notes/Router.md',
        destination: 'Notes/Router (2).md',
        status: dryRun ? 'ready' : 'imported',
        documentId: dryRun ? undefined : 'id-router',
        notes: [],
        warnings: ['A document named "Router.md" already exists; imported as "Router (2).md"'],
      },
      {
        source: 'Notes/image.png',
        destination: 'Notes/Router (2).assets/image.png',
        status: dryRun ? 'ready' : 'imported',
        attachmentOf: 'Notes/Router.md',
        notes: [],
        warnings: [],
      },
      {
        source: 'Notes/unused.png',
        status: 'skipped',
        reason: 'Not used by any imported document',
        notes: [],
        warnings: [],
      },
    ],
    summary: { documents: 2, attachments: 1, folders: 1, skipped: 1, failed: 0, warnings: 1 },
  };
}

interface Upload {
  query: string;
  parts: { path: string; size: number; type?: string }[];
}

function mockImport() {
  const uploads: Upload[] = [];
  mockApi((request) => {
    if (request.path === '/tree') return { body: { root: sampleTree() } };
    if (request.path === '/documents/recent?limit=10') return { body: { items: [] } };
    if (request.path === '/pins') return { body: { items: [] } };
    if (request.method === 'POST' && request.path.startsWith('/import?')) {
      const form = request.body as FormData;
      uploads.push({
        query: request.path,
        parts: form.getAll('files').map((part) => ({
          path: (part as File).name,
          size: (part as File).size,
          type: (part as File).type,
        })),
      });
      return { body: report(request.path.includes('dryRun=true')) };
    }
    return undefined;
  });
  return uploads;
}

describe('import dialog (UI_SPEC §134–135)', () => {
  it('previews a directory with warnings before importing, then imports the same selection', async () => {
    const uploads = mockImport();
    const { user } = renderApp('/');
    await user.click(await screen.findByRole('button', { name: 'Import' }));
    const dialog = await screen.findByRole('dialog', { name: 'Import documentation' });
    expect(within(dialog).getByRole('radio', { name: /Markdown directory/ })).toBeChecked();
    await user.selectOptions(within(dialog).getByLabelText('Import into'), 'Infrastructure');
    await user.upload(within(dialog).getByLabelText('Choose Markdown directory'), [
      file('Notes/Plain.md', '# Plain\n'),
      file('Notes/Router.md', '# Router\n'),
      file('Notes/image.png', 'binary image bytes'),
      file('Notes/unused.png', 'unused bytes'),
      file('Notes/.git/config', '[core]'),
      file('Notes/.obsidian/app.json', '{}'),
    ]);

    const preview = await screen.findByRole('dialog', { name: 'Import preview' });
    expect(uploads).toHaveLength(1);
    expect(uploads[0]!.query).toBe(
      '/import?importer=markdown-directory&destination=Infrastructure&dryRun=true',
    );
    // Hidden folders stay in the browser; other files are listed by name only.
    const nameOnly = { size: 0, type: IMPORT_NAME_ONLY_TYPE };
    expect(uploads[0]!.parts).toEqual([
      { path: 'Notes/Plain.md', size: 8, type: 'text/markdown' },
      { path: 'Notes/Router.md', size: 9, type: 'text/markdown' },
      { path: 'Notes/image.png', ...nameOnly },
      { path: 'Notes/unused.png', ...nameOnly },
    ]);
    expect(within(preview).getByRole('status')).toHaveTextContent(
      '2 documents and 1 attachment will be imported into Documentation. 1 new folder · 1 skipped · 1 warning.',
    );
    expect(within(preview).getByText(/Left out 2 files in hidden folders/)).toHaveTextContent(
      '(.git, .obsidian)',
    );
    const rows = within(preview).getAllByRole('row');
    expect(rows.map((row) => row.textContent)).toEqual([
      'SourceDestinationStatus',
      'Notes/Plain.mdAdds missing front matter: id, title, created, updatedNotes/Plain.mdReady',
      'Notes/Router.md A document named "Router.md" already exists; imported as "Router (2).md"Notes/Router (2).mdReady',
      'Notes/image.pngAttachment of Notes/Router.mdNotes/Router (2).assets/image.pngReady',
      'Notes/unused.pngNot used by any imported document—Skipped',
    ]);

    await user.click(within(preview).getByRole('button', { name: 'Import 2 documents' }));
    const finished = await screen.findByRole('dialog', { name: 'Import finished' });
    expect(uploads[1]!.query).toBe(
      '/import?importer=markdown-directory&destination=Infrastructure&dryRun=false',
    );
    // The import sends the attachment the preview listed, and still not the unused file.
    expect(uploads[1]!.parts).toEqual([
      ...uploads[0]!.parts.slice(0, 2),
      { path: 'Notes/image.png', size: 18, type: 'text/markdown' },
      { path: 'Notes/unused.png', ...nameOnly },
    ]);
    expect(within(finished).getByRole('status')).toHaveTextContent(
      '2 documents and 1 attachment imported into',
    );
    expect(await screen.findByText('Imported 2 documents')).toBeInTheDocument();
    await user.click(within(finished).getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('opens a single imported document and supports individual Markdown files', async () => {
    const uploads: Upload[] = [];
    mockApi((request) => {
      if (request.path === '/tree') return { body: { root: sampleTree() } };
      if (request.path === '/documents/recent?limit=10') return { body: { items: [] } };
      if (request.path === '/pins') return { body: { items: [] } };
      if (request.method === 'POST' && request.path.startsWith('/import?')) {
        const form = request.body as FormData;
        uploads.push({
          query: request.path,
          parts: form.getAll('files').map((part) => ({ path: (part as File).name, size: 0 })),
        });
        const dryRun = request.path.includes('dryRun=true');
        return {
          body: {
            importer: 'markdown-directory',
            destination: '',
            dryRun,
            items: [
              {
                source: 'Single.md',
                destination: 'Single.md',
                status: dryRun ? 'ready' : 'imported',
                documentId: dryRun ? undefined : 'id-single',
                notes: [],
                warnings: [],
              },
            ],
            summary: {
              documents: 1,
              attachments: 0,
              folders: 0,
              skipped: 0,
              failed: 0,
              warnings: 0,
            },
          } satisfies ImportReport,
        };
      }
      if (request.path === '/documents/id-single')
        return { body: documentDto('id-single', 'Single.md') };
      if (request.path === '/documents/id-single/attachments') return { body: { items: [] } };
      return undefined;
    });
    const { user, location } = renderApp('/');
    await user.click(await screen.findByRole('button', { name: 'Import' }));
    const dialog = await screen.findByRole('dialog', { name: 'Import documentation' });
    await user.click(within(dialog).getByRole('radio', { name: /Markdown files/ }));
    await user.upload(within(dialog).getByLabelText('Choose Markdown files'), [
      file('Downloads/Single.md', '# Single\n'),
    ]);
    const preview = await screen.findByRole('dialog', { name: 'Import preview' });
    // Individual files are imported flat: the browser's folder is not part of the path.
    expect(uploads[0]!.parts.map((part) => part.path)).toEqual(['Single.md']);
    await user.click(within(preview).getByRole('button', { name: 'Import 1 document' }));
    await user.click(
      within(await screen.findByRole('dialog', { name: 'Import finished' })).getByRole('button', {
        name: 'Done',
      }),
    );
    await waitFor(() => expect(location()).toBe('/doc/id-single'));
  });

  it('converts HTML files and labels converted items in the preview', async () => {
    const uploads: Upload[] = [];
    mockApi((request) => {
      if (request.path === '/tree') return { body: { root: sampleTree() } };
      if (request.path === '/documents/recent?limit=10') return { body: { items: [] } };
      if (request.path === '/pins') return { body: { items: [] } };
      if (request.method === 'POST' && request.path.startsWith('/import?')) {
        const form = request.body as FormData;
        uploads.push({
          query: request.path,
          parts: form
            .getAll('files')
            .map((part) => ({ path: (part as File).name, size: (part as File).size })),
        });
        return {
          body: {
            importer: 'html',
            destination: '',
            dryRun: true,
            items: [
              {
                source: 'old-note.html',
                destination: 'old-note.md',
                status: 'ready',
                converted: true,
                notes: [],
                warnings: ['Removed a script that Markdown cannot contain'],
              },
            ],
            summary: {
              documents: 1,
              attachments: 0,
              folders: 0,
              skipped: 0,
              failed: 0,
              warnings: 1,
            },
          } satisfies ImportReport,
        };
      }
      return undefined;
    });
    const { user } = renderApp('/');
    await user.click(await screen.findByRole('button', { name: 'Import' }));
    const dialog = await screen.findByRole('dialog', { name: 'Import documentation' });
    await user.click(within(dialog).getByRole('radio', { name: /HTML files/ }));
    const input = within(dialog).getByLabelText('Choose HTML files');
    expect(input).toHaveAttribute('accept', '.html,.htm,text/html');
    await user.upload(input, [file('old-note.html', '<p>Old</p>')]);
    const preview = await screen.findByRole('dialog', { name: 'Import preview' });
    expect(uploads[0]!.query).toBe('/import?importer=html&destination=&dryRun=true');
    expect(uploads[0]!.parts).toEqual([{ path: 'old-note.html', size: 10 }]);
    expect(within(preview).getAllByRole('row')[1]).toHaveTextContent(
      'old-note.html Removed a script that Markdown cannot containold-note.mdConverted',
    );
  });

  it('shows server errors and lets the user go back to choose other files', async () => {
    mockApi((request) => {
      if (request.path === '/tree') return { body: { root: folder('', []) } };
      if (request.method === 'POST' && request.path.startsWith('/import?'))
        return {
          status: 400,
          body: {
            error: {
              code: 'IMPORT_UNSUPPORTED',
              message: 'No Markdown files were found in the selection',
            },
          },
        };
      return undefined;
    });
    const { user } = renderApp('/');
    // The empty application offers import next to New document (UI_SPEC §73).
    await screen.findByText('No documentation yet');
    await user.click(screen.getByRole('button', { name: 'Import Markdown' }));
    const dialog = await screen.findByRole('dialog', { name: 'Import documentation' });
    await user.upload(within(dialog).getByLabelText('Choose Markdown directory'), [
      file('Pictures/a.png', 'x'),
    ]);
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'No Markdown files were found in the selection',
    );
    expect(within(dialog).getByRole('button', { name: 'Select files' })).toBeEnabled();
    await user.upload(within(dialog).getByLabelText('Choose Markdown directory'), [
      file('Repo/.git/HEAD', 'ref'),
    ]);
    expect(within(dialog).getByRole('alert')).toHaveTextContent(
      'The selection contains no files outside hidden folders.',
    );
  });
});
