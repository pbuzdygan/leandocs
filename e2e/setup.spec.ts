import { expect, test } from '@playwright/test';

test('first run creates the administrator and completes the storage flow', async ({
  page,
  request,
}, testInfo) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/setup$/);
  await expect(page.getByRole('heading', { name: 'Welcome' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('setup-welcome.png') });
  await page.getByLabel('Username').fill('admin');
  await page.getByLabel('Password', { exact: true }).fill('a long browser test passphrase');
  await page.getByLabel('Confirm password').fill('a long browser test passphrase');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Documentation storage' })).toBeVisible();
  await expect(page.locator('.setup__path')).toContainText('/content');
  await page.screenshot({ path: testInfo.outputPath('setup-storage.png') });
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Ready' })).toBeVisible();
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.screenshot({ path: testInfo.outputPath('login.png') });
  await page.getByLabel('Username').fill('admin');
  await page.getByLabel('Password', { exact: true }).fill('a long browser test passphrase');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText('No documentation yet')).toBeVisible();
  await page.context().storageState({ path: 'test-results/auth-state.json' });
  await page.reload();
  await expect(page.getByText('No documentation yet')).toBeVisible();
  const status = await request.get('/api/v1/auth/setup');
  expect(await status.json()).toMatchObject({ required: false });
  await page.goto('/setup');
  await expect(page.getByRole('heading', { name: 'Setup already complete' })).toBeVisible();
});
