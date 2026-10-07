import { expect, test, type Page } from '@playwright/test';
import { csrfRequest } from './csrf-request';

/** `DEFAULT_SETTINGS` from packages/shared (the e2e project does not depend on it). */
const DEFAULT_SETTINGS = {
  general: { openLastDocument: false, newDocumentFolder: '', autosave: true },
  editor: {
    defaultMode: 'visual',
    autosaveDelay: 1500,
    lineNumbers: true,
    wordWrap: true,
    tabSize: 2,
  },
};

/**
 * Waits until the server has stored the settings the page just changed. Settings pages save in
 * the background (a CSRF token request, then the update), so a reload or `page.goto` right after
 * a change can abort the save on a slow machine.
 */
export async function expectStoredSettings(
  page: Page,
  expected: { general?: Record<string, unknown>; editor?: Record<string, unknown> },
): Promise<void> {
  await expect
    .poll(async () => {
      const response = await page.request.get('/api/v1/settings');
      return response.json() as Promise<Record<string, Record<string, unknown>>>;
    })
    .toMatchObject(expected);
}

/** Sets the default editor (Settings › Editor) on the test server. */
export async function setDefaultEditor(page: Page, mode: 'visual' | 'source'): Promise<void> {
  const response = await csrfRequest(page.request).patch('/api/v1/settings', {
    data: { editor: { defaultMode: mode } },
  });
  expect(response.status()).toBe(200);
}

/**
 * Settings are server state shared by every spec (one worker, one server): a spec that changes
 * them puts back the defaults after each test, so later specs start from the same state.
 */
export function restoreSettingsAfterEach(): void {
  test.afterEach(async ({ page }) => {
    const response = await csrfRequest(page.request).patch('/api/v1/settings', {
      data: DEFAULT_SETTINGS,
    });
    expect(response.status()).toBe(200);
  });
}
