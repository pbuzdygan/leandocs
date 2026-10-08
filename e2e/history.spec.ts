import { expect, test } from './document-fixture';

/** P16-05 (UI_SPEC §94): ← → in the topbar follow the browser's own history. */

test('back and forward follow the browser history, also after a reload', async ({
  page,
  createDocument,
}) => {
  const first = await createDocument('History First', '# History First\n');
  const second = await createDocument('History Second', '# History Second\n');
  const back = page.getByRole('button', { name: 'Back', exact: true });
  const forward = page.getByRole('button', { name: 'Forward', exact: true });

  await page.goto(`/doc/${first}`);
  await expect(page.getByRole('heading', { level: 1, name: 'History First' })).toBeVisible();
  await expect(back).toBeDisabled();
  await page.getByRole('treeitem', { name: 'History Second', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/doc/${second}$`));
  await expect(back).toBeEnabled();
  await expect(forward).toBeDisabled();

  await back.click();
  await expect(page).toHaveURL(new RegExp(`/doc/${first}$`));
  await expect(forward).toBeEnabled();

  // The position survives a reload of the tab.
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'History First' })).toBeVisible();
  await expect(forward).toBeEnabled();
  await forward.click();
  await expect(page).toHaveURL(new RegExp(`/doc/${second}$`));

  // The browser's own Back button moves the same history.
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`/doc/${first}$`));
  await expect(forward).toBeEnabled();
  await expect(back).toBeDisabled();
});

test('is not shown on phones', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Back', exact: true })).toBeHidden();
});
