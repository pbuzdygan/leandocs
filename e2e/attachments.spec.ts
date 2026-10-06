/// <reference lib="dom" />
import { csrfRequest } from './csrf-request';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aSf8AAAAASUVORK5CYII=',
  'base64',
);

async function pasteImage(page: Page, selector: string) {
  await page.locator(selector).evaluate((element, base64) => {
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
    const transfer = new DataTransfer();
    transfer.items.add(new File([bytes], 'screenshot.png', { type: 'image/png' }));
    element.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }),
    );
  }, png.toString('base64'));
}

for (const mode of ['Visual', 'Source'] as const) {
  test(`E2E-03: ${mode} paste, drop, upload, render and delete attachments`, async ({ page }) => {
    const name = `Attachments ${mode}`;
    const response = await csrfRequest(page.request).post('/api/v1/documents', {
      data: { name, content: 'Tail.' },
    });
    const { id } = (await response.json()) as { id: string };
    await page.goto(`/doc/${id}/edit`);
    await page.getByRole('tab', { name: mode, exact: true }).click();
    const selector = mode === 'Visual' ? '[aria-label="Visual document"]' : '.cm-content';
    const editor = page.locator(selector);
    await editor.click();
    await page.keyboard.press('ControlOrMeta+End');
    await pasteImage(page, selector);
    const panel = page.getByRole('region', { name: 'Attachments', exact: true });
    await panel.locator('summary').click();
    await expect(panel).toContainText('screenshot.png');
    if (mode === 'Visual')
      await expect(editor.locator('img[src]')).toHaveAttribute(
        'src',
        `/api/v1/documents/${id}/attachments/screenshot.png`,
      );
    else await expect(editor).toContainText('screenshot.png');
    await editor.evaluate((element) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File(['services: {}'], 'compose.yaml', { type: 'text/yaml' }));
      element.dispatchEvent(new DragEvent('dragenter', { dataTransfer: transfer, bubbles: true }));
    });
    await expect(page.getByText('Drop file to attach', { exact: true })).toBeVisible();
    await editor.evaluate((element) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File(['services: {}'], 'compose.yaml', { type: 'text/yaml' }));
      const rect = element.getBoundingClientRect();
      element.dispatchEvent(
        new DragEvent('drop', {
          dataTransfer: transfer,
          bubbles: true,
          cancelable: true,
          clientX: rect.left + 10,
          clientY: rect.top + 10,
        }),
      );
    });
    await expect(panel).toContainText('compose.yaml');
    await expect(page.getByText('Drop file to attach', { exact: true })).toHaveCount(0);
    await page.getByLabel('Choose attachments').setInputFiles({
      name: 'notes.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('attachment notes'),
    });
    await expect(panel).toContainText('notes.txt');
    await expect(page.getByText('Uploading attachments… You can keep writing.')).toHaveCount(0);
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    const image = page.locator('.doc__body img');
    await expect(image).toBeVisible();
    expect(await image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBe(1);
    await expect(page.locator('.doc__body a', { hasText: 'compose.yaml' })).toHaveAttribute(
      'href',
      `/api/v1/documents/${id}/attachments/compose.yaml`,
    );
    const file = readFileSync(path.resolve('.e2e-data/content', `${name}.md`), 'utf8');
    expect(file).toContain(`${encodeURIComponent(name)}.assets/screenshot.png`);
    expect(file).not.toContain('/api/v1/');
    await page.reload();
    await expect(page.locator('.doc__body img')).toBeVisible();
    await page.getByRole('region', { name: 'Attachments' }).locator('summary').click();
    const row = page
      .getByRole('region', { name: 'Attachments' })
      .locator('li')
      .filter({ hasText: 'notes.txt' });
    await row.getByRole('button', { name: 'Delete', exact: true }).click();
    await page
      .getByRole('dialog', { name: 'Delete attachment?' })
      .getByRole('button', { name: 'Delete permanently' })
      .click();
    await expect(row).toHaveCount(0);
    expect((await page.request.get(`/api/v1/documents/${id}/attachments/notes.txt`)).status()).toBe(
      404,
    );
    await page.screenshot({
      path: `test-results/attachments-${mode.toLowerCase()}.png`,
      fullPage: true,
    });
  });
}

for (const mode of ['Visual', 'Source'] as const) {
  test(`${mode} pending uploads keep their insertion position when the user types, and invalid files show errors`, async ({
    page,
  }) => {
    const response = await csrfRequest(page.request).post('/api/v1/documents', {
      data: { name: `Async Attachments ${mode}`, content: 'Before. After.' },
    });
    const { id } = (await response.json()) as { id: string };
    await page.goto(`/doc/${id}/edit`);
    await page.getByRole('tab', { name: mode, exact: true }).click();
    const selector = mode === 'Visual' ? '[aria-label="Visual document"]' : '.cm-content';
    await page.locator(selector).click();
    await page.keyboard.press('ControlOrMeta+Home');
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(`**/documents/${id}/attachments`, async (route) => {
      if (route.request().method() === 'POST') await gate;
      await route.continue();
    });
    await pasteImage(page, selector);
    await expect(page.getByText('Uploading attachments… You can keep writing.')).toBeVisible();
    await expect(
      page.getByRole('tab', { name: mode === 'Visual' ? 'Source' : 'Visual', exact: true }),
    ).toBeDisabled();
    if (mode === 'Visual')
      await expect(page.getByText('Uploading image…', { exact: true })).toBeVisible();
    await page.keyboard.type('New prefix. ');
    release();
    if (mode === 'Visual') await expect(page.locator(selector).locator('img[src]')).toBeVisible();
    else await expect(page.locator(selector)).toContainText('New prefix. ![screenshot.png]');
    await expect(page.locator(selector)).toContainText('Before. After.');
    await page
      .getByLabel('Choose attachments')
      .setInputFiles({ name: 'fake.png', mimeType: 'image/png', buffer: Buffer.from('not a PNG') });
    // Scoped to the toast body: Radix also mirrors the text into a transient aria-live region.
    await expect(
      page.locator('.toast__message', { hasText: /Upload failed: The file contents/ }),
    ).toBeVisible();
    await expect(page.locator(selector)).not.toContainText('fake.png');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('status', { name: 'Save status' })).toHaveText('Saved');
    const saved = await page.request.get(`/api/v1/documents/${id}`);
    const body = ((await saved.json()) as { content: string }).content;
    expect(body.indexOf('New prefix.')).toBeLessThan(body.indexOf('screenshot.png'));
    expect(body.indexOf('screenshot.png')).toBeLessThan(body.indexOf('Before. After.'));
  });
}

test('direct SVG navigation cannot run scripts or access the app origin', async ({
  page,
  context,
}) => {
  const response = await csrfRequest(page.request).post('/api/v1/documents', {
    data: { name: 'Sandbox SVG' },
  });
  const { id } = (await response.json()) as { id: string };
  const upload = await csrfRequest(page.request).post(`/api/v1/documents/${id}/attachments`, {
    multipart: {
      file: {
        name: 'active.svg',
        mimeType: 'image/svg+xml',
        buffer: Buffer.from(
          '<svg xmlns="http://www.w3.org/2000/svg"><script>window.__attachmentScriptRan = true; localStorage.setItem("attachmentScriptRan", "yes")</script><rect width="10" height="10"/></svg>',
        ),
      },
    },
  });
  expect(upload.status()).toBe(201);
  const item = (await upload.json()) as { url: string };
  await page.goto('/');
  const asset = await context.newPage();
  await asset.goto(item.url);
  expect(
    await asset.evaluate(
      () => (globalThis as { __attachmentScriptRan?: boolean }).__attachmentScriptRan,
    ),
  ).toBeUndefined();
  expect(await page.evaluate(() => localStorage.getItem('attachmentScriptRan'))).toBeNull();
  await asset.close();
});
