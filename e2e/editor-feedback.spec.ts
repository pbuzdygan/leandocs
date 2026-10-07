import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, newParagraphAtEnd, test, type Page } from './document-fixture';
import { restoreSettingsAfterEach, setDefaultEditor } from './settings';

restoreSettingsAfterEach();

/** Owner feedback 2026-10-02 on the visual editor (P6-06…P6-12, P4-12). */

const content = path.resolve(import.meta.dirname, '../.e2e-data/content');

async function openVisual(page: Page, id: string) {
  await setDefaultEditor(page, 'visual');
  await page.goto(`/doc/${id}/edit`);
  const editor = page.locator('[aria-label="Visual document"]');
  await expect(editor).toBeVisible();
  await expect(page.getByText('Loading editor…', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Code block', exact: true })).toBeEnabled();
  return editor;
}

async function slash(page: Page, item: string) {
  await page.keyboard.type('/');
  await page.getByRole('menuitem', { name: item, exact: true }).click();
}

async function saveAndRead(page: Page, file: string): Promise<string> {
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page).not.toHaveURL(/\/edit$/);
  return readFileSync(path.join(content, file), 'utf8');
}

test('long documents: slash menu opens at the caret and Done stays reachable', async ({
  page,
  createDocument,
}) => {
  const paragraphs = Array.from({ length: 80 }, (_, i) => `Paragraph ${i + 1}.`).join('\n\n');
  const id = await createDocument('Long Feedback', `${paragraphs}\n`);
  await openVisual(page, id);
  await newParagraphAtEnd(page);
  await page.keyboard.type('/');
  const menu = page.getByRole('menu', { name: 'Insert block' });
  await expect(menu).toBeVisible();
  const box = (await menu.boundingBox())!;
  const viewport = page.viewportSize()!;
  // Fully on screen, near the bottom where the caret is, not at the top of the editor.
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
  expect(box.y + box.height).toBeGreaterThan(viewport.height / 2);
  await page.keyboard.press('Escape');
  // The editing bar is still on screen after scrolling to the end.
  const done = page.getByRole('button', { name: 'Done', exact: true });
  await expect(done).toBeInViewport();
});

test('callouts are editable and saved as directives', async ({ page, createDocument }) => {
  const id = await createDocument('Callout Feedback', 'Intro.\n');
  await openVisual(page, id);
  await newParagraphAtEnd(page);
  await slash(page, 'Callout');
  await page.keyboard.type('Back up first.');
  await page.getByLabel('Callout type').selectOption('warning');
  await expect(page.locator('.visual-content .callout--warning')).toContainText('Back up first.');
  const saved = await saveAndRead(page, 'Callout Feedback.md');
  expect(saved).toContain(':::warning\nBack up first.\n:::');
});

test('tables grow by rows and columns from the toolbar', async ({ page, createDocument }) => {
  const id = await createDocument('Table Feedback', 'Intro.\n');
  await openVisual(page, id);
  await newParagraphAtEnd(page);
  await slash(page, 'Table');
  await page.locator('.visual-content td').first().click();
  await page.getByRole('button', { name: 'Row below' }).click();
  await page.getByRole('button', { name: 'Column right' }).click();
  await expect(page.locator('.visual-content tr')).toHaveCount(4);
  await page.getByRole('button', { name: 'Delete column' }).click();
  await page.getByRole('button', { name: 'Delete row' }).click();
  const saved = await saveAndRead(page, 'Table Feedback.md');
  const rows = saved.split('\n').filter((line) => line.startsWith('|'));
  expect(rows).toHaveLength(4); // header, delimiter, 2 body rows
  expect(rows[0]!.split('|').length - 2).toBe(3);
});

test('code blocks get a language and are left with Enter twice', async ({
  page,
  createDocument,
}) => {
  const id = await createDocument('Code Feedback', 'Intro.\n');
  await openVisual(page, id);
  await newParagraphAtEnd(page);
  await slash(page, 'Code block');
  await page.getByLabel('Code language').selectOption('yaml');
  await expect(page.locator('.visual-content pre.code-block')).toHaveText('');
  await page
    .getByRole('textbox', { name: 'Visual document', exact: true })
    .press('ControlOrMeta+End');
  await page.keyboard.type('services:\n  web: nginx');
  await expect(page.locator('.visual-content pre.code-block .hljs-attr').first()).toBeVisible();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.type('After the code.');
  const saved = await saveAndRead(page, 'Code Feedback.md');
  expect(saved).toContain('Intro.\n\n```yaml\nservices:\n  web: nginx\n```\n\nAfter the code.');
});

test('Contents lists H1 and nested headings; full width is the default', async ({
  page,
  createDocument,
}) => {
  const id = await createDocument(
    'Contents Feedback',
    '# Overview\n\ntext\n\n## Hardware\n\ntext\n\n# Network\n\ntext\n',
  );
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto(`/doc/${id}`);
  const toc = page.getByRole('navigation', { name: 'Table of contents' });
  await expect(toc.getByRole('link')).toHaveText(['Overview', 'Hardware', 'Network']);
  const article = page.locator('article.doc');
  expect((await article.boundingBox())!.width).toBeGreaterThan(900);
  await page.getByRole('button', { name: 'Use reading width' }).click();
  expect((await article.boundingBox())!.width).toBeLessThanOrEqual(900);
});
