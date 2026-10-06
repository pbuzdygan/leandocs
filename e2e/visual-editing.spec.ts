import { csrfRequest } from './csrf-request';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const content = path.resolve(import.meta.dirname, '../.e2e-data/content');

test('visual editing, toolbar and mode switching preserve Markdown and front matter', async ({
  page,
}) => {
  const preserved =
    ':::warning\nKeep **this**.\n:::\n\n[[Server#Hardware|host]]\n\n<div onclick="window.__xss=true">unsafe</div>\n\n```mermaid\nflowchart LR\n A --> B\n```';
  const response = await csrfRequest(page.request).post('/api/v1/documents', {
    data: { name: 'Visual Roundtrip', content: `${preserved}\n\nEditable paragraph.\n` },
  });
  const { id } = (await response.json()) as { id: string };
  const file = path.join(content, 'Visual Roundtrip.md');
  writeFileSync(
    file,
    readFileSync(file, 'utf8').replace(
      'title:',
      '# Keep this comment\ncustom: "preserve me"\ntitle:',
    ),
  );
  await page.goto(`/doc/${id}/edit`);
  await expect(page.getByRole('tab', { name: 'Visual', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  const editor = page.getByRole('textbox', { name: 'Visual document' });
  await expect(editor).toBeVisible();
  await editor.locator('p').last().click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Edited visually.');
  await page.getByRole('tab', { name: 'Source', exact: true }).click();
  await expect(page.locator('.cm-content')).toContainText('Edited visually.');
  await page.getByRole('tab', { name: 'Visual', exact: true }).click();
  await expect(editor).toContainText('Edited visually.');
  await editor.locator('p').last().click();
  await page
    .getByRole('toolbar', { name: 'Formatting', exact: true })
    .getByRole('button', { name: 'Heading 2', exact: true })
    .click();
  await expect(editor.locator('h2')).toContainText('Edited visually.');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('status', { name: 'Save status' })).toHaveText('Saved');
  const result = readFileSync(file, 'utf8');
  expect(result).toContain(preserved);
  expect(result).toContain('# Keep this comment\ncustom: "preserve me"');
  expect(result).toContain('## Editable paragraph. Edited visually.');
  expect(await page.evaluate(() => (globalThis as { __xss?: boolean }).__xss)).toBeUndefined();
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(
    page.getByRole('heading', { level: 2, name: 'Editable paragraph. Edited visually.' }),
  ).toBeVisible();
});

test('slash commands insert a heading and visual edits autosave', async ({ page }) => {
  const response = await csrfRequest(page.request).post('/api/v1/documents', {
    data: { name: 'Slash Authoring' },
  });
  const { id } = (await response.json()) as { id: string };
  await page.goto(`/doc/${id}/edit`);
  const editor = page.getByRole('textbox', { name: 'Visual document' });
  await editor.click();
  await page.keyboard.type('/');
  await expect(page.getByRole('menu', { name: 'Insert block' })).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.keyboard.type('My heading');
  await expect(editor.locator('h2')).toContainText('My heading');
  await expect(page.getByRole('status', { name: 'Save status' })).toHaveText('Saved', {
    timeout: 10000,
  });
  await page.reload();
  await expect(editor.locator('h2')).toContainText('My heading');
});

test('visual checklists, links, images and tables are editable and saved as Markdown', async ({
  page,
}) => {
  const response = await csrfRequest(page.request).post('/api/v1/documents', {
    data: { name: 'Visual Elements', content: '- [ ] Pending\n\nTail.' },
  });
  const { id } = (await response.json()) as { id: string };
  await page.goto(`/doc/${id}/edit`);
  const editor = page.getByRole('textbox', { name: 'Visual document' });
  const toolbar = page.getByRole('toolbar', { name: 'Formatting', exact: true });
  await editor.getByRole('checkbox', { name: 'Toggle task' }).check();
  await expect(editor.getByRole('checkbox')).toBeChecked();
  await editor.locator('p').last().click();
  await page.keyboard.press('End');
  await toolbar.getByRole('button', { name: 'Link', exact: true }).click();
  const link = page.getByRole('dialog', { name: 'Insert link' });
  await link.getByLabel('Location').fill('/doc/example');
  await link.getByLabel('Text', { exact: true }).fill('Website');
  await link.getByRole('button', { name: 'Insert', exact: true }).click();
  await expect(editor.locator('a')).toHaveAttribute('href', '/doc/example');
  await toolbar.getByRole('button', { name: 'Image', exact: true }).click();
  const image = page.getByRole('dialog', { name: 'Insert image' });
  await image.getByLabel('Location').fill('/favicon.svg');
  await image.getByLabel('Alternative text').fill('Logo');
  await image.getByRole('button', { name: 'Insert', exact: true }).click();
  await expect(editor.getByRole('img', { name: 'Logo' })).toBeVisible();
  await toolbar.getByRole('button', { name: 'Table', exact: true }).click();
  await expect(editor.locator('table')).toBeVisible();
  await editor.locator('th').first().click();
  await page.keyboard.type('Column');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('status', { name: 'Save status' })).toHaveText('Saved');
  await page.screenshot({ path: 'test-results/visual-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole('navigation', { name: 'Documentation navigation' }),
  ).not.toBeInViewport();
  await page.screenshot({ path: 'test-results/visual-mobile.png', fullPage: true });
  const file = readFileSync(path.join(content, 'Visual Elements.md'), 'utf8');
  expect(file).toContain('[x] Pending');
  expect(file).toContain('[Website](/doc/example)');
  expect(file).toContain('![Logo](/favicon.svg)');
  expect(file).toContain('Column');
});
