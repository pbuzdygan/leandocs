import { csrfRequest } from './csrf-request';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const content = path.resolve(import.meta.dirname, '../.e2e-data/content');

/** E2E-02 (PROJECT_SPEC §91): create folder → move note → refresh → tree preserved. */
test('E2E-02: documents and folders created and moved in the UI persist on disk', async ({
  page,
}) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { level: 1, name: /Documentation|No documentation yet/ }),
  ).toBeVisible();

  // Create a document from the topbar.
  await page.getByRole('button', { name: 'New', exact: true }).click();
  const newDocument = page.getByRole('dialog', { name: 'New document' });
  await newDocument.getByLabel('Name').fill('UniFi');
  await newDocument.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'UniFi' })).toBeVisible();
  expect(existsSync(path.join(content, 'UniFi.md'))).toBe(true);

  // Create a folder from the sidebar "+" menu.
  await page.getByRole('button', { name: 'New document or folder' }).click();
  await page.getByRole('menuitem', { name: 'New folder' }).click();
  const newFolder = page.getByRole('dialog', { name: 'New folder' });
  await newFolder.getByLabel('Name').fill('Network');
  await newFolder.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByRole('treeitem', { name: 'Network' })).toBeVisible();

  // Move the open document into the folder via the header menu.
  await page.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('menuitem', { name: 'Move', exact: true }).click();
  const move = page.getByRole('dialog', { name: 'Move "UniFi"' });
  await move.getByRole('option', { name: 'Network' }).click();
  await move.getByRole('button', { name: 'Move' }).click();
  await expect(page.getByText('Moved to Network', { exact: true })).toBeVisible();

  // Refresh: the tree and the open document survive; the file is really in the folder.
  await page.reload();
  const tree = page.getByRole('tree', { name: 'Documentation' });
  await expect(tree.getByRole('treeitem', { name: 'Network' })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  const document = tree.getByRole('treeitem', { name: 'UniFi' });
  await expect(document).toHaveAttribute('aria-level', '2');
  await expect(document).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText('Network');
  expect(existsSync(path.join(content, 'UniFi.md'))).toBe(false);
  expect(readFileSync(path.join(content, 'Network/UniFi.md'), 'utf8')).toMatch(/^---\nid: /);
});

test('rename, move to trash and undo from the tree', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New document' });
  await dialog.getByLabel('Name').fill('Old name');
  await dialog.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Old name' })).toBeVisible();

  const item = page.getByRole('treeitem', { name: 'Old name' });
  await item.focus();
  await page.keyboard.press('F2');
  const rename = page.getByRole('dialog', { name: 'Rename document' });
  await rename.getByLabel('File name').fill('New name');
  await rename.getByLabel('Title').fill('New name');
  await rename.getByRole('button', { name: 'Rename' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'New name' })).toBeVisible();
  expect(existsSync(path.join(content, 'New name.md'))).toBe(true);

  await page.getByRole('treeitem', { name: 'New name' }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Move to trash' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Move to Trash' }).click();
  await expect(page.getByText('"New name" moved to Trash', { exact: true })).toBeVisible();
  expect(existsSync(path.join(content, 'New name.md'))).toBe(false);

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'New name' })).toBeVisible();
  expect(existsSync(path.join(content, 'New name.md'))).toBe(true);
});

test('drag a document onto a folder in the tree', async ({ page }) => {
  // Self-contained: its own folder and document, created through the API.
  expect(
    (
      await csrfRequest(page.request).post('/api/v1/folders', { data: { name: 'Drop Target' } })
    ).ok(),
  ).toBe(true);
  expect(
    (await csrfRequest(page.request).post('/api/v1/documents', { data: { name: 'Dragged' } })).ok(),
  ).toBe(true);
  await page.goto('/');

  const tree = page.getByRole('tree', { name: 'Documentation' });
  await tree
    .getByRole('treeitem', { name: 'Dragged' })
    .dragTo(tree.getByRole('treeitem', { name: 'Drop Target' }));
  await expect(page.getByText('Moved "Dragged" to Drop Target', { exact: true })).toBeVisible();
  expect(existsSync(path.join(content, 'Drop Target/Dragged.md'))).toBe(true);
  await expect(tree.getByRole('treeitem', { name: 'Dragged' })).toHaveAttribute('aria-level', '2');
});
