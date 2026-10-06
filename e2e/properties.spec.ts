import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

/** Phase 10 acceptance: typical infrastructure documentation needs minimal repetitive work. */

const content = path.resolve(import.meta.dirname, '../.e2e-data/content');

test('template, tags, Info panel and pins', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.getByRole('button', { name: 'New', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New document' });
  await dialog.getByLabel('Name').fill('Template Host');
  await dialog.getByLabel('Template').selectOption('Server');
  await dialog.getByRole('button', { name: 'Create' }).click();
  await expect(page).toHaveURL(/\/edit$/);
  const created = () => readFileSync(path.join(content, 'Template Host.md'), 'utf8');
  expect(created()).toContain('tags:\n  - server\n');
  expect(created()).toContain('# Template Host\n\n## Overview');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page).not.toHaveURL(/\/edit$/);

  // Info tab: add a tag and an alias, saved into the front matter.
  await page.getByRole('tab', { name: 'Info' }).click();
  const form = page.getByRole('form', { name: 'Properties' });
  await expect(form).toContainText('Template Host.md');
  await form.getByLabel('Tags', { exact: true }).fill('incus');
  await form.getByLabel('Tags', { exact: true }).press('Enter');
  await form.getByLabel('Aliases', { exact: true }).fill('tpl-host');
  await form.getByLabel('Aliases', { exact: true }).press('Enter');
  await form.getByRole('button', { name: 'Save properties' }).click();
  await expect(page.locator('.toast__message', { hasText: 'Properties saved.' })).toBeVisible();
  expect(created()).toContain('tags:\n  - server\n  - incus\n');
  expect(created()).toContain('aliases:\n  - tpl-host\n');

  // A tag in the header filters search by that tag.
  await page.locator('.doc__tags').getByRole('button', { name: 'incus' }).click();
  const input = page.getByRole('combobox', { name: 'Search documentation' });
  await expect(input).toHaveValue('tag:incus ');
  await expect(page.getByRole('option', { name: /Template Host/ })).toBeVisible();
  await page.keyboard.press('Escape');

  // Pin from the document menu; it shows in the sidebar and on Home.
  await page.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('menuitem', { name: 'Pin', exact: true }).click();
  const pinned = page.getByRole('navigation', { name: 'Pinned documents' });
  await expect(pinned.getByRole('link', { name: 'Template Host' })).toBeVisible();
  await page.goto('/');
  await expect(page.getByRole('region', { name: 'Pinned' })).toContainText('Template Host');
});
