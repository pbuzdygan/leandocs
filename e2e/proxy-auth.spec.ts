import { csrfRequest } from './csrf-request';
import { expect, test } from '@playwright/test';

test('gateway identity opens content without local setup or a session cookie', async ({ page }) => {
  // The test browser supplies the identity as a gateway would; only the test server trusts loopback.
  await page.context().setExtraHTTPHeaders({ 'x-auth-request-user': 'owner@example.com' });
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'No documentation yet', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('owner@example.com')).toBeVisible();
  await expect(page.getByRole('button', { name: 'User menu' })).toHaveCount(0);
  expect(
    (await page.context().cookies()).some((cookie) => cookie.name === 'leandocs_session'),
  ).toBe(false);
  const created = await csrfRequest(page.request).post('/api/v1/documents', {
    data: { name: 'Gateway Guide', content: 'Gateway-only content.\n' },
  });
  expect(created.status()).toBe(201);
  const { id } = await created.json();
  await page.goto(`/doc/${id}`);
  await expect(page.getByRole('heading', { name: 'Gateway Guide', exact: true })).toBeVisible();
  await page.context().setExtraHTTPHeaders({});
  expect((await page.request.get('/api/v1/tree')).status()).toBe(401);
  await page.reload();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByText(/Authentication is managed by your gateway/)).toBeVisible();
  await expect(page.getByLabel('Password')).toHaveCount(0);
  await page.context().setExtraHTTPHeaders({ 'x-auth-request-user': 'owner@example.com' });
  await page.getByRole('button', { name: 'Check access again' }).click();
  await expect(page).toHaveURL(new RegExp(`/doc/${id}$`));
});

test('unauthorized gateway users get instructions and cannot create local credentials', async ({
  page,
}) => {
  await page.context().setExtraHTTPHeaders({ 'x-auth-request-user': 'someone-else@example.com' });
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('button', { name: 'Check access again' })).toBeVisible();
  expect((await page.request.get('/api/v1/tree')).status()).toBe(401);
  expect(
    (
      await csrfRequest(page.request).post('/api/v1/auth/login', {
        data: { username: 'admin', password: 'a long browser passphrase' },
      })
    ).status(),
  ).toBe(403);
  await page.goto('/setup');
  await expect(
    page.getByRole('heading', { name: 'Authentication managed by gateway' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create account' })).toHaveCount(0);
});
