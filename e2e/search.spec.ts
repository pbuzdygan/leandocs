import { csrfRequest } from './csrf-request';
import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem('leandocs.editor.mode', JSON.stringify('source')),
  );
});

async function createDocument(page: Page, name: string, body: string): Promise<string> {
  const response = await csrfRequest(page.request).post('/api/v1/documents', {
    data: { name, content: body },
  });
  expect(response.ok()).toBe(true);
  return ((await response.json()) as { id: string }).id;
}

/** E2E-04 (PROJECT_SPEC §91): search phrase → correct document returned. */
test('E2E-04: Ctrl+K finds a phrase, highlights it and opens the right document', async ({
  page,
}) => {
  const id = await createDocument(
    page,
    'Search Target',
    '# Search Target\n\nThe Incus VM uses macvlan-shim for host communication.\n',
  );
  await createDocument(page, 'Search Decoy', '# Search Decoy\n\nNothing relevant here.\n');
  await page.goto('/');
  await expect(page.getByText('Recently updated')).toBeVisible();

  await page.keyboard.press('ControlOrMeta+k');
  const input = page.getByRole('combobox', { name: 'Search documentation' });
  await expect(input).toBeFocused();
  await input.fill('macvlan host');
  const result = page.getByRole('option', { name: /Search Target/ });
  await expect(result).toBeVisible();
  await expect(result.locator('mark').first()).toHaveText('macvlan');
  await expect(page.getByRole('option', { name: /Search Decoy/ })).toHaveCount(0);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new RegExp(`/doc/${id}$`));
  await expect(page.getByRole('heading', { level: 1, name: 'Search Target' })).toBeVisible();
});

test('search follows edits and folds Polish letters', async ({ page }) => {
  const id = await createDocument(page, 'Źródło zasilania', 'Old wording: walrus.\n');
  await page.goto('/');
  await expect(page.getByText('Recently updated')).toBeVisible();
  await page.keyboard.press('ControlOrMeta+k');
  const input = page.getByRole('combobox', { name: 'Search documentation' });
  await input.fill('zrodlo');
  await expect(page.getByRole('option', { name: /Źródło zasilania/ })).toBeVisible();
  await page.keyboard.press('Escape');

  const current = await (await page.request.get(`/api/v1/documents/${id}`)).json();
  const saved = await csrfRequest(page.request).put(`/api/v1/documents/${id}`, {
    data: { content: 'New wording: narwhal.\n', expectedRevision: current.revision },
  });
  expect(saved.ok()).toBe(true);

  await page.keyboard.press('ControlOrMeta+k');
  await input.fill('narwhal');
  await expect(page.getByRole('option', { name: /Źródło zasilania/ })).toBeVisible();
  await input.fill('walrus');
  await expect(page.getByText('No results for “walrus”')).toBeVisible();
});

test('Ctrl+P quick open works from inside the editor instead of printing', async ({ page }) => {
  const id = await createDocument(page, 'Quick Open Source', '# Quick Open Source\n\ntext\n');
  const target = await createDocument(page, 'Runbook Quick Target', '# Runbook Quick Target\n');
  await page.goto(`/doc/${id}/edit`);
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+p');
  const input = page.getByRole('combobox', { name: 'Open document' });
  await expect(input).toBeFocused();
  await input.fill('rqt');
  await expect(page.getByRole('option')).toHaveCount(1);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new RegExp(`/doc/${target}$`));
});

test('Settings › Index rebuilds the search index', async ({ page }) => {
  await createDocument(page, 'Rebuild Survivor', 'kept after rebuild: ocelot\n');
  await page.goto('/settings');
  await expect(page).toHaveURL(/\/settings\/storage$/);
  await expect(page.getByText('Data directory')).toBeVisible();
  await page.getByRole('link', { name: 'Index' }).click();
  await page.getByRole('button', { name: 'Rebuild index' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Rebuild', exact: true }).click();
  await expect(page.locator('.toast__message', { hasText: 'Search index rebuilt.' })).toBeVisible();
  await expect(page.getByText('Never')).toHaveCount(0);

  await page.keyboard.press('ControlOrMeta+k');
  await page.getByRole('combobox', { name: 'Search documentation' }).fill('ocelot');
  await expect(page.getByRole('option', { name: /Rebuild Survivor/ })).toBeVisible();
});
