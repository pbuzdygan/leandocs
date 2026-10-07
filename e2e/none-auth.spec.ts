import { csrfRequest } from './csrf-request';
import { expect, test } from '@playwright/test';

test('explicit none mode opens documents anonymously and warns across Settings sections', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'No documentation yet' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'User menu' })).toHaveCount(0);
  const created = await csrfRequest(page.request).post('/api/v1/documents', {
    data: { name: 'Anonymous Guide', content: 'No account required.\n' },
  });
  expect(created.status()).toBe(201);
  const { id } = await created.json();
  await page.goto(`/doc/${id}`);
  await expect(page.getByRole('heading', { name: 'Anonymous Guide' })).toBeVisible();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Authentication disabled');
  await expect(page.getByRole('alert')).toContainText('read, edit and delete');
  await page.getByRole('link', { name: 'Storage', exact: true }).click();
  await expect(page.getByText('Data directory', { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('settings-auth-warning.png') });
  await page.getByRole('link', { name: 'Index', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Authentication disabled');
  await page.getByRole('link', { name: 'Broken links', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Authentication disabled');
  await page.goto('/login');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByLabel('Password')).toHaveCount(0);
  await page.goto('/setup');
  await expect(page.getByRole('heading', { name: 'Authentication disabled' })).toBeVisible();
  await expect(page.getByLabel('Password')).toHaveCount(0);
  await expect((await page.request.get('/api/v1/auth/session')).json()).resolves.toMatchObject({
    authMode: 'none',
    user: null,
  });
  expect(
    (await page.context().cookies()).some((cookie) => cookie.name === 'leandocs_session'),
  ).toBe(false);
});

test('a foreign website cannot submit a multipart upload even when login is disabled', async ({
  page,
}) => {
  const created = await csrfRequest(page.request).post('/api/v1/documents', {
    data: { name: 'CSRF Upload Target' },
  });
  expect(created.status()).toBe(201);
  const { id } = await created.json();
  const endpoint = `http://127.0.0.1:18767/api/v1/documents/${id}/attachments`;
  await page.route('http://localhost:18768/**', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<form method="post" enctype="multipart/form-data" action="${endpoint}"><input type="file" name="file"><button>Upload</button></form>`,
    }),
  );
  await page.goto('http://localhost:18768/attack');
  await page.locator('input').setInputFiles({
    name: 'forged.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('foreign upload'),
  });
  const response = page.waitForResponse(endpoint);
  await page.getByRole('button', { name: 'Upload' }).click();
  expect((await response).status()).toBe(403);
  const attachments = await page.request.get(endpoint);
  expect(await attachments.json()).toEqual({ items: [] });
});
