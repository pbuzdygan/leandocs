import { csrfRequest } from './csrf-request';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem('leandocs.editor.mode', JSON.stringify('source')),
  );
});

const content = path.resolve(import.meta.dirname, '../.e2e-data/content');

async function createDocument(page: Page, name: string, body: string): Promise<string> {
  const response = await csrfRequest(page.request).post('/api/v1/documents', {
    data: { name, content: body },
  });
  expect(response.ok()).toBe(true);
  return ((await response.json()) as { id: string }).id;
}

/** E2E-01 (PROJECT_SPEC §91; login comes with Phase 11): create → edit → save → refresh → exists. */
test('E2E-01: edit in the source editor, autosave, refresh, content is in the file', async ({
  page,
}) => {
  const id = await createDocument(page, 'Edit Me', '# Edit Me\n\nFirst line.\n');
  await page.goto(`/doc/${id}`);
  await page.getByRole('treeitem', { name: 'Edit Me', exact: true }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Edit', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/doc/${id}/edit$`));

  const editor = page.locator('.cm-content');
  await editor.click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type('\n## Added in the browser\n\nSaved automatically.');
  const status = page.getByRole('status', { name: 'Save status' });
  await expect(status).toHaveText(/Unsaved|Saving/);
  await expect(status).toHaveText('Saved', { timeout: 10_000 });

  const file = readFileSync(path.join(content, 'Edit Me.md'), 'utf8');
  expect(file).toContain('## Added in the browser\n\nSaved automatically.');
  expect(file).toMatch(/^---\nid: /);

  await page.reload();
  await expect(page.locator('.cm-content')).toContainText('Saved automatically.');
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page).toHaveURL(new RegExp(`/doc/${id}$`));
  await expect(page.getByRole('heading', { level: 2, name: 'Added in the browser' })).toBeVisible();
});

test('a change made on disk while editing shows the conflict dialog and never overwrites it', async ({
  page,
}) => {
  const id = await createDocument(page, 'Conflict Me', '# Conflict Me\n\nOriginal.\n');
  await page.goto(`/doc/${id}/edit`);
  await expect(page.getByRole('status', { name: 'Save status' })).toHaveText('Saved');

  // Someone edits the same file in another editor.
  const file = path.join(content, 'Conflict Me.md');
  const external = readFileSync(file, 'utf8').replace('Original.', 'Edited in VS Code.');
  writeFileSync(file, external);

  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type('\nMy browser edit.');
  await page.keyboard.press('ControlOrMeta+s');

  const dialog = page.getByRole('dialog', { name: 'Document changed outside the editor' });
  await expect(dialog).toBeVisible();
  expect(readFileSync(file, 'utf8')).toBe(external);

  await dialog.getByRole('button', { name: 'Reload from disk' }).click();
  await expect(page.locator('.cm-content')).toContainText('Edited in VS Code.');
  await expect(page.locator('.cm-content')).not.toContainText('My browser edit.');
  await expect(page.getByRole('status', { name: 'Save status' })).toHaveText('Saved');
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.locator('.doc__body')).toContainText('Edited in VS Code.');
});

test('source shortcuts format text and Escape closes search before leaving edit mode', async ({
  page,
}) => {
  const id = await createDocument(page, 'Shortcuts', 'format me');
  await page.goto(`/doc/${id}/edit`);
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('ControlOrMeta+b');
  await expect(page.locator('.cm-content')).toContainText('**format me**');
  await page.keyboard.press('ControlOrMeta+i');
  await expect(page.locator('.cm-content')).toContainText('***format me***');
  await page.keyboard.press('ControlOrMeta+f');
  await expect(page.locator('.cm-search')).toBeVisible();
  // Escape in the editor itself must also prefer the open search panel.
  await page.locator('.cm-content').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.cm-search')).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`/doc/${id}/edit$`));
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('status', { name: 'Save status' })).toHaveText('Saved');
  await page.locator('.cm-content').click();
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(new RegExp(`/doc/${id}$`));
});

test('a local draft survives reopening and is restored only on request', async ({ page }) => {
  const id = await createDocument(page, 'Recover Me', 'Saved original.');
  await page.goto(`/doc/${id}/edit`);
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type(' My unsaved draft.');
  // Inspect storage before the autosave debounce; simulate reopening in the same browser.
  const draft = await page.evaluate((id) => localStorage.getItem(`leandocs.draft.${id}`), id);
  expect(draft).toContain('My unsaved draft.');
  await page.route('**/api/v1/documents/*', async (route) => {
    if (route.request().method() === 'PUT') await route.abort();
    else await route.continue();
  });
  page.once('dialog', (dialog) => void dialog.accept());
  await page.reload();
  const notice = page.getByRole('region', { name: 'Unsaved local changes' });
  await expect(notice).toBeVisible();
  await expect(page.locator('.cm-content')).not.toContainText('My unsaved draft.');
  await notice.getByRole('button', { name: 'Restore', exact: true }).click();
  await expect(page.locator('.cm-content')).toContainText('My unsaved draft.');
  expect(readFileSync(path.join(content, 'Recover Me.md'), 'utf8')).not.toContain(
    'My unsaved draft.',
  );
});
