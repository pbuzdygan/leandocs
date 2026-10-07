import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from './document-fixture';
import { expectStoredSettings, restoreSettingsAfterEach } from './settings';

/** P16-01 (UI_SPEC §81–83): settings are saved on the server and change how editing works. */

restoreSettingsAfterEach();

const content = path.resolve(import.meta.dirname, '../.e2e-data/content');

test('editor settings: default editor, tab size and autosave off', async ({
  page,
  createDocument,
}) => {
  const id = await createDocument('Settings Editing', 'Start\n');

  await page.goto('/settings/editor');
  await page.getByRole('combobox', { name: 'Default editor' }).selectOption('source');
  await page.getByRole('combobox', { name: 'Tab size' }).selectOption('4');
  await page.getByRole('link', { name: 'General' }).click();
  await page.getByRole('checkbox', { name: 'Autosave' }).uncheck();
  await expectStoredSettings(page, {
    general: { autosave: false },
    editor: { defaultMode: 'source', tabSize: 4 },
  });
  // Saved on the server: still there after a reload.
  await page.reload();
  await expect(page.getByRole('checkbox', { name: 'Autosave' })).not.toBeChecked();

  await page.goto(`/doc/${id}/edit`);
  const editor = page.getByRole('textbox', { name: 'Markdown source' });
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type('- item');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await page.keyboard.type('nested');
  await expect(editor).toContainText('nested');

  // Autosave is off: nothing is written until Save.
  const status = page.getByRole('status', { name: 'Save status' });
  await expect(status).toHaveText('Unsaved');
  await page.waitForTimeout(2500);
  await expect(status).toHaveText('Unsaved');
  expect(readFileSync(path.join(content, 'Settings Editing.md'), 'utf8')).not.toContain('nested');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(status).toHaveText('Saved');
  // Tab indents by four spaces (the list marker may be continued by the editor).
  expect(readFileSync(path.join(content, 'Settings Editing.md'), 'utf8')).toMatch(
    /^ {4}(- )?nested$/m,
  );
});

test('opens the last viewed document on startup when enabled', async ({ page, createDocument }) => {
  const id = await createDocument('Settings Last Opened', 'Remember me.\n');
  await page.goto('/settings/general');
  await page.getByRole('checkbox', { name: 'Open last document on startup' }).check();
  await expectStoredSettings(page, { general: { openLastDocument: true } });
  await page.goto(`/doc/${id}`);
  await expect(page.getByText('Remember me.')).toBeVisible();
  await page.goto('/');
  await expect(page).toHaveURL(new RegExp(`/doc/${id}$`));
});
