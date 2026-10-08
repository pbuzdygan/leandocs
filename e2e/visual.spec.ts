import { expect, test, type Page } from '@playwright/test';

/**
 * Visual regression (P16-06, UI_SPEC §165): screenshots of the key views in both themes, compared
 * with the baselines in `visual.spec.ts-snapshots/`. The server (port 18770) starts with the fixed
 * documents in `e2e/visual-content/`; `visual.setup.ts` signs in once for all of them. Baselines are made and compared only in the official
 * Playwright image with Chromium, as in CI; after an intended change of the UI, update them with
 * `--update-snapshots` (see docs/development.md).
 */

const DOCUMENT = '/doc/visual-buzhulk';

async function openDocument(page: Page) {
  await page.goto(DOCUMENT);
  await expect(page.getByRole('heading', { level: 1, name: 'BUZHULK' })).toBeVisible();
  await expect(page.locator('.code-block').first()).toBeVisible();
}

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`${colorScheme} theme`, () => {
    test.use({ colorScheme, viewport: { width: 1440, height: 900 } });

    test('document view', async ({ page }) => {
      await openDocument(page);
      await expect(page).toHaveScreenshot(`document-${colorScheme}.png`);
    });

    test('visual editor', async ({ page }) => {
      await page.goto(`${DOCUMENT}/edit`);
      await expect(page.locator('.ProseMirror')).toContainText('Restore tests run');
      await expect(page.getByRole('status', { name: 'Save status' })).toHaveText('Saved');
      await page.locator('.ProseMirror').blur();
      await expect(page).toHaveScreenshot(`visual-editor-${colorScheme}.png`);
    });

    test('source editor', async ({ page }) => {
      await page.goto(`${DOCUMENT}/edit`);
      await page.getByRole('tab', { name: 'Source' }).click();
      // CodeMirror renders only the visible lines.
      await expect(page.locator('.cm-content')).toContainText('Main Docker and Incus host');
      await page.locator('.cm-content').blur();
      await expect(page).toHaveScreenshot(`source-editor-${colorScheme}.png`);
    });

    test('search palette', async ({ page }) => {
      await openDocument(page);
      await page.getByRole('button', { name: /Search documentation/ }).click();
      await page.getByRole('combobox', { name: 'Search documentation' }).fill('docker');
      await expect(page.getByRole('option')).toHaveCount(2);
      await expect(page).toHaveScreenshot(`search-${colorScheme}.png`);
    });

    test('settings', async ({ page }) => {
      await page.goto('/settings/general');
      await expect(page.getByRole('checkbox', { name: 'Autosave' })).toBeVisible();
      await expect(page).toHaveScreenshot(`settings-${colorScheme}.png`);
    });

    test('mobile document', async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await openDocument(page);
      await expect(page).toHaveScreenshot(`mobile-document-${colorScheme}.png`);
    });
  });
}
