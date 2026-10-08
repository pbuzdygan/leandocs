import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test, expect } from './document-fixture';
import { csrfRequest } from './csrf-request';
import { restoreSettingsAfterEach, setDefaultEditor } from './settings';

restoreSettingsAfterEach();

const content = path.resolve(import.meta.dirname, '../.e2e-data/content');

/**
 * E2E-05 (PROJECT_SPEC §91) and critical test C (§103): a Markdown file edited in an external
 * editor is detected by the open app. This case rewrites the file in place, as VS Code does.
 */
test('E2E-05: external edits refresh the viewed document and notify without reloading the page', async ({
  page,
  createDocument,
}) => {
  const id = await createDocument('External View', '# Before external edit\n');
  const stream = page.waitForResponse((response) => response.url().endsWith('/api/v1/events'));
  await page.goto(`/doc/${id}`);
  await expect(page.getByRole('heading', { name: 'Before external edit' })).toBeVisible();
  await stream;
  const file = path.join(content, 'External View.md');
  await writeFile(
    file,
    (await readFile(file, 'utf8')).replace('Before external edit', 'After external edit'),
  );
  await expect(page.getByRole('heading', { name: 'After external edit' })).toBeVisible();
  await expect(page.getByText('Document updated externally.', { exact: true })).toBeVisible();
});

/** Critical test C with editors that save atomically (write a temporary file, then rename). */
test('an atomic external save refreshes the view and search without changing the document id', async ({
  page,
  createDocument,
}) => {
  const id = await createDocument('External Atomic', '# Atomic before\n\nOld atomic phrase.\n');
  const stream = page.waitForResponse((response) => response.url().endsWith('/api/v1/events'));
  await page.goto(`/doc/${id}`);
  await expect(page.getByRole('heading', { name: 'Atomic before' })).toBeVisible();
  await stream;
  const file = path.join(content, 'External Atomic.md');
  const temporary = path.join(content, '.External Atomic.md.swp');
  await writeFile(
    temporary,
    (await readFile(file, 'utf8'))
      .replace('Atomic before', 'Atomic after')
      .replace('Old atomic phrase.', 'Quokkaflux appears after the external save.'),
  );
  await rename(temporary, file);
  await expect(page.getByRole('heading', { name: 'Atomic after' })).toBeVisible();
  await expect(page.getByText('Document updated externally.', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/doc/${id}$`));

  await page.keyboard.press('ControlOrMeta+k');
  await page.getByRole('combobox', { name: 'Search documentation' }).fill('quokkaflux');
  await expect(page.getByRole('option', { name: /External Atomic/ })).toBeVisible();
});

test('external renames, new folders and deletions update the open app', async ({
  page,
  createDocument,
}) => {
  const id = await createDocument('External Rename', '# Renamed outside\n');
  const folder = path.join(content, 'External Folder');
  try {
    const stream = page.waitForResponse((response) => response.url().endsWith('/api/v1/events'));
    await page.goto(`/doc/${id}`);
    await expect(page.getByRole('heading', { name: 'Renamed outside' })).toBeVisible();
    await stream;
    const tree = page.getByRole('tree', { name: 'Documentation' });

    await mkdir(folder);
    await writeFile(path.join(folder, 'Outside Note.md'), '# Outside note\n');
    await expect(tree.getByRole('treeitem', { name: 'External Folder' })).toBeVisible();

    // The front matter id travels with the file, so the open link keeps working.
    await rename(path.join(content, 'External Rename.md'), path.join(folder, 'Moved Outside.md'));
    await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText(
      'External Folder',
    );
    await expect(page.getByRole('heading', { name: 'Renamed outside' })).toBeVisible();

    await rm(path.join(folder, 'Moved Outside.md'));
    await expect(page.getByText('Document removed externally.', { exact: true })).toBeVisible();
    await expect(page.getByText('Document not found')).toBeVisible();
    // Recreate it so the fixture can clean up through the API, as it does for every document.
    await writeFile(
      path.join(content, 'External Rename.md'),
      `---\nid: ${id}\n---\n# Renamed outside\n`,
    );
    await expect
      .poll(async () => (await page.request.get(`/api/v1/documents/${id}`)).status())
      .toBe(200);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test('a clean visual editor preserves its version until an external conflict is resolved', async ({
  page,
  createDocument,
}) => {
  const id = await createDocument('External Visual', 'Original visual paragraph.\n');
  const stream = page.waitForResponse((response) => response.url().endsWith('/api/v1/events'));
  await page.goto(`/doc/${id}/edit`);
  const editor = page.getByRole('textbox', { name: 'Visual document' });
  await expect(editor).toContainText('Original visual paragraph.');
  await stream;
  const file = path.join(content, 'External Visual.md');
  const external = (await readFile(file, 'utf8')).replace(
    'Original visual paragraph.',
    'Outside visual paragraph.',
  );
  await writeFile(file, external);
  const dialog = page.getByRole('dialog', { name: 'Document changed outside the editor' });
  await expect(dialog).toBeVisible();
  // Modal accessibility correctly hides the background editor from ordinary role queries.
  await expect(
    page.getByRole('textbox', { name: 'Visual document', includeHidden: true }),
  ).toContainText('Original visual paragraph.');
  expect(await readFile(file, 'utf8')).toBe(external);
  await dialog.getByRole('button', { name: 'Reload from disk' }).click();
  await expect(editor).toContainText('Outside visual paragraph.');
  await expect(page.getByRole('status', { name: 'Save status' })).toHaveText('Saved');
});

test('external deletion retains unsaved text and saves a recoverable copy', async ({ page }) => {
  await setDefaultEditor(page, 'source');
  const response = await csrfRequest(page.request).post('/api/v1/documents', {
    data: { name: 'External Deletion', content: 'Original recovery text.\n' },
  });
  expect(response.status()).toBe(201);
  const { id } = (await response.json()) as { id: string };
  const file = path.join(content, 'External Deletion.md');
  let copyId: string | undefined;
  try {
    const stream = page.waitForResponse((response) => response.url().endsWith('/api/v1/events'));
    await page.goto(`/doc/${id}/edit`);
    await expect(page.locator('.cm-content')).toContainText('Original recovery text.');
    await stream;
    await page.locator('.cm-content').click();
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.type('My recovered work.');
    await rm(file);
    const dialog = page.getByRole('dialog', { name: 'Document changed outside the editor' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Reload from disk' })).toBeDisabled();
    await expect(dialog.getByRole('button', { name: 'Review changes' })).toBeDisabled();
    const created = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' && response.url().endsWith('/api/v1/documents'),
    );
    await dialog.getByRole('button', { name: 'Save as copy' }).click();
    const copy = (await (await created).json()) as { id: string; content: string };
    copyId = copy.id;
    expect(copy.content).toContain('My recovered work.');
    await expect(page).toHaveURL(new RegExp(`/doc/${copyId}/edit$`));
    await expect(page.locator('.cm-content')).toContainText('My recovered work.');
    expect(
      await page.evaluate((id) => localStorage.getItem(`leandocs.draft.${id}`), id),
    ).toBeNull();
  } finally {
    await rm(file, { force: true });
    if (copyId) {
      const deleted = await csrfRequest(page.request).delete(`/api/v1/documents/${copyId}`);
      expect(deleted.status()).toBe(200);
    }
  }
});
