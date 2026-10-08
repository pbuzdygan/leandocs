import { existsSync } from 'node:fs';
import path from 'node:path';
import { csrfRequest } from './csrf-request';
import { createTrashedDocument, expect, test } from './document-fixture';

/** P16-04 (UI_SPEC §136): restore and permanent deletion from the Trash page. */

const content = path.resolve(import.meta.dirname, '../.e2e-data/content');

test('restores a document and deletes another one permanently', async ({ page }) => {
  await createTrashedDocument(page, 'Trash Keep', '# Trash Keep\n\nStill here.\n');
  await createTrashedDocument(page, 'Trash Gone', '# Trash Gone\n');

  await page.goto('/');
  await page.getByRole('link', { name: 'Trash' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Trash' })).toBeVisible();
  const keepRow = page.getByRole('row').filter({ hasText: 'Trash Keep' });
  await expect(keepRow).toContainText('Documentation');

  await keepRow.getByRole('button', { name: 'Restore Trash Keep' }).click();
  await expect(
    page.getByText('"Trash Keep" restored to Documentation', { exact: true }),
  ).toBeVisible();
  await expect(keepRow).toHaveCount(0);
  await expect(page.getByRole('treeitem', { name: 'Trash Keep', exact: true })).toBeVisible();
  expect(existsSync(path.join(content, 'Trash Keep.md'))).toBe(true);

  await page.getByRole('button', { name: 'Delete permanently Trash Gone' }).click();
  const dialog = page.getByRole('dialog', { name: 'Delete permanently?' });
  await dialog.getByRole('button', { name: 'Delete permanently' }).click();
  await expect(page.getByText('"Trash Gone" deleted permanently', { exact: true })).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: 'Trash Gone' })).toHaveCount(0);
  const listed = await (await page.request.get('/api/v1/trash')).json();
  expect(JSON.stringify(listed)).not.toContain('Trash Gone');

  // The restored document is back in the tree and opens as before.
  await page.getByRole('treeitem', { name: 'Trash Keep', exact: true }).click();
  await expect(page.getByText('Still here.')).toBeVisible();
  // Leave no test document behind: the restored one goes back to the trash.
  const id = /\/doc\/([^/]+)$/.exec(page.url())?.[1];
  expect(id).toBeTruthy();
  const cleanup = await csrfRequest(page.request).delete(`/api/v1/documents/${id}`);
  expect(cleanup.status()).toBe(200);
});
