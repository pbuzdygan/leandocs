/// <reference lib="dom" />
import { csrfRequest } from './csrf-request';
import { expect, test } from '@playwright/test';

/** Markdown rendering in a real browser, including the real (lazy-loaded) Mermaid. */
test('renders tables, callouts, code, Mermaid, wiki links and the table of contents', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const violations: string[] = [];
    (globalThis as { cspViolations?: string[] }).cspViolations = violations;
    document.addEventListener('securitypolicyviolation', (event) =>
      violations.push(event.effectiveDirective),
    );
  });
  const target = await csrfRequest(page.request).post('/api/v1/documents', {
    data: { name: 'Render Target', content: '## Details\n\nTarget page.\n' },
  });
  expect(target.ok()).toBe(true);
  const created = await csrfRequest(page.request).post('/api/v1/documents', {
    data: {
      name: 'Render Check',
      content: [
        '# Render Check',
        '',
        '## Table',
        '',
        '| Key | Value |',
        '| --- | ----- |',
        '| CPU | N100  |',
        '',
        '## Diagram',
        '',
        '```mermaid',
        'flowchart LR',
        '  A[Internet] --> B[Router]',
        '```',
        '',
        ':::danger',
        'Careful.',
        ':::',
        '',
        '```bash',
        'echo hello',
        '```',
        '',
        'See [[Render Target#Details]] and [[Missing Page]].',
        '',
        '<img src=x onerror="window.__xss = true">',
      ].join('\n'),
    },
  });
  const { id } = (await created.json()) as { id: string };
  await page.goto(`/doc/${id}`);

  const body = page.getByRole('tabpanel');
  await expect(page.getByRole('heading', { level: 1, name: 'Render Check' })).toHaveCount(1);
  await expect(body.getByRole('table')).toContainText('N100');
  await expect(body.locator('.callout--danger')).toContainText('Careful.');
  await expect(body.locator('.code-block__lang')).toHaveText('bash');
  await expect(body.locator('figure.mermaid svg')).toBeVisible({ timeout: 15_000 });
  await expect(body.locator('figure.mermaid svg')).toContainText('Router');
  await expect(body.locator('.broken-link')).toHaveText('Missing Page');

  const toc = page.getByRole('navigation', { name: 'Table of contents' });
  await expect(toc.getByRole('link')).toHaveText(['Table', 'Diagram']);

  expect(await page.evaluate(() => (globalThis as { __xss?: boolean }).__xss)).toBeUndefined();

  expect(
    await page.evaluate(() => (globalThis as { cspViolations?: string[] }).cspViolations),
  ).toEqual([]);

  await body.getByRole('link', { name: 'Render Target › Details' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Render Target' })).toBeVisible();
  await expect(page).toHaveURL(/#details$/);
});
