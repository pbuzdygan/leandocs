import { expect, test } from '@playwright/test';

test('logout revokes the session; login failures are generic and successful login restores access', async ({
  page,
  request,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'User menu' }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect((await page.request.get('/api/v1/tree')).status()).toBe(401);
  await page.getByLabel('Username').fill('admin');
  await page.getByLabel('Password', { exact: true }).fill('incorrect password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Incorrect username or password');
  await page.getByLabel('Password', { exact: true }).fill('a long browser test passphrase');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  expect((await page.request.get('/api/v1/tree')).status()).toBe(200);
  // Logout affected the setup project's stored session, so refresh it for later isolated tests.
  await page.context().storageState({ path: 'test-results/auth-state.json' });
  expect((await request.get('/api/v1/health')).status()).toBe(200);
});

test('repeated sign-in attempts show a wait while existing authenticated sessions remain usable', async ({
  page,
  browser,
}) => {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  try {
    const anonymous = await context.newPage();
    await anonymous.goto('http://127.0.0.1:18765/login');
    await expect(anonymous.getByLabel('Username')).toBeVisible();
    let limited = false;
    for (let n = 0; n < 6; n++) {
      await anonymous.getByLabel('Username').fill(n % 2 ? 'admin' : 'unknown');
      await anonymous.getByLabel('Password', { exact: true }).fill('incorrect password');
      const response = anonymous.waitForResponse(
        (response) =>
          response.url().endsWith('/api/v1/auth/login') && response.request().method() === 'POST',
      );
      await anonymous.getByRole('button', { name: 'Sign in', exact: true }).click();
      const result = await response;
      if (result.status() === 429) {
        expect(Number(result.headers()['retry-after'])).toBeGreaterThan(0);
        await expect(anonymous.getByRole('alert')).toContainText(/Try again in \d+ seconds/);
        await expect(anonymous.getByLabel('Password', { exact: true })).toHaveValue('');
        limited = true;
        break;
      }
      expect(result.status()).toBe(401);
      await expect(anonymous.getByRole('alert')).toContainText('Incorrect username or password');
    }
    expect(limited).toBe(true);
    expect((await page.request.get('/api/v1/tree')).status()).toBe(200);
    expect((await page.request.get('/api/v1/health')).status()).toBe(200);
  } finally {
    await context.close();
  }
});
