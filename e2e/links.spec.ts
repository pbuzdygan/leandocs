import { csrfRequest } from './csrf-request';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

/** Phase 9 acceptance: a reference is visible from both sides and survives a rename. */

const content = path.resolve(import.meta.dirname, '../.e2e-data/content');

async function createDocument(
  page: Page,
  name: string,
  body: string,
  folder = '',
): Promise<string> {
  const response = await csrfRequest(page.request).post('/api/v1/documents', {
    data: { name, folder, content: body },
  });
  expect(response.ok(), await response.text()).toBe(true);
  return ((await response.json()) as { id: string }).id;
}

test('links and backlinks are visible from both sides and follow a rename', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const target = await createDocument(page, 'Link Target', '# Link Target\n\n## Ports\n');
  const source = await createDocument(
    page,
    'Link Source',
    'Wiki [[Link Target#Ports]], file [target](Link%20Target.md) and [[Nowhere]].\n',
  );

  await page.goto(`/doc/${target}`);
  await page.getByRole('tab', { name: 'Links' }).click();
  const referenced = page.getByRole('region', { name: 'Referenced by' });
  await expect(referenced.getByRole('link', { name: 'Link Source' })).toBeVisible();
  await expect(referenced).toContainText('2 links');

  await page.goto(`/doc/${source}`);
  const outgoing = page.getByRole('region', { name: 'Links to' });
  await expect(outgoing.getByRole('link', { name: 'Link Target' })).toBeVisible();
  await expect(outgoing.getByText('[[Nowhere]]')).toHaveClass(/broken-link/);

  // Rename the target from the tree: the Markdown link in the source file follows.
  await page.getByRole('treeitem', { name: 'Link Target', exact: true }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Rename', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('File name').fill('Renamed Target');
  await dialog.getByRole('button', { name: 'Rename' }).click();
  await expect(page.getByRole('treeitem', { name: 'Link Target', exact: true })).toBeVisible();
  await expect
    .poll(() => readFileSync(path.join(content, 'Link Source.md'), 'utf8'))
    .toContain('[target](Renamed%20Target.md)');
  expect(readFileSync(path.join(content, 'Link Source.md'), 'utf8')).toContain(
    '[[Link Target#Ports]]',
  );

  await page.goto('/settings/links');
  const table = page.getByRole('table');
  await expect(table.getByText('[[Nowhere]]')).toBeVisible();
  await expect(table.getByText('Renamed%20Target.md')).toHaveCount(0);
});

test('[[ suggests documents in the visual and the source editor', async ({ page }) => {
  await createDocument(page, 'Autocomplete Target', 'Target body.\n', '');
  const id = await createDocument(page, 'Autocomplete Source', 'Intro.\n');

  await page.addInitScript(() =>
    localStorage.setItem('leandocs.editor.mode', JSON.stringify('visual')),
  );
  await page.goto(`/doc/${id}/edit`);
  const visual = page.locator('[aria-label="Visual document"]');
  await visual.locator('p').last().click();
  await page.keyboard.press('End');
  await page.keyboard.type(' See [[autocomp');
  const picker = page.getByRole('listbox', { name: 'Link to document' });
  await expect(picker.getByRole('option', { name: /Autocomplete Target/ })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(visual.locator('.wiki-link')).toHaveText('Autocomplete Target');
  await page.keyboard.type(' done.');

  await page.getByRole('tab', { name: 'Source', exact: true }).click();
  const source = page.locator('.cm-content');
  await expect(source).toContainText('Intro. See [[Autocomplete Target]] done.');
  await source.click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type('\n\nAlso [[Autocomplete T');
  await expect(page.locator('.cm-tooltip-autocomplete')).toContainText('Autocomplete Target');
  // CodeMirror ignores Enter for ~75 ms after the list opens (accidental-accept guard).
  await page.waitForTimeout(150);
  await page.keyboard.press('Enter');
  await expect(source).toContainText('Also [[Autocomplete Target]]');

  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/doc/${id}$`));
  const saved = () => readFileSync(path.join(content, 'Autocomplete Source.md'), 'utf8');
  await expect.poll(saved).toContain('Also [[Autocomplete Target]]');
  expect(saved()).toContain('Intro. See [[Autocomplete Target]] done.');
  expect(saved()).not.toContain('\\[');
  await expect(page.getByRole('link', { name: 'Autocomplete Target' }).first()).toBeVisible();
});
