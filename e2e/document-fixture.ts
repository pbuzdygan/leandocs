import { expect, test as base, type Page } from '@playwright/test';
import { csrfRequest } from './csrf-request';

/** Remove documents even after a failed assertion so retries can reuse their filenames. */
export const test = base.extend<{
  createDocument: (name: string, content?: string) => Promise<string>;
}>({
  createDocument: async ({ page }, use) => {
    const created: string[] = [];
    await use(async (name, content) => {
      const response = await csrfRequest(page.request).post('/api/v1/documents', {
        data: { name, content },
      });
      expect(response.status(), await response.text()).toBe(201);
      const { id } = (await response.json()) as { id: string };
      created.push(id);
      return id;
    });
    for (const id of created) {
      const response = await csrfRequest(page.request).delete(`/api/v1/documents/${id}`);
      expect(response.status(), await response.text()).toBe(200);
    }
  },
});

/**
 * Creates a document and moves it to the trash at once (not through `createDocument`, whose
 * cleanup expects the document to still exist). Returns the trash entry id.
 */
export async function createTrashedDocument(page: Page, name: string, content = '') {
  const created = await csrfRequest(page.request).post('/api/v1/documents', {
    data: { name, content },
  });
  expect(created.status(), await created.text()).toBe(201);
  const { id } = (await created.json()) as { id: string };
  const trashed = await csrfRequest(page.request).delete(`/api/v1/documents/${id}`);
  expect(trashed.status(), await trashed.text()).toBe(200);
  return ((await trashed.json()) as { trashId: string }).trashId;
}

/**
 * Puts the caret at the end of the document and starts a new paragraph. Keys pressed while the
 * editor is still settling after load can be lost (flaky on CI), so the keys are sent again until
 * the empty paragraph exists; once it does, nothing more is typed.
 */
export async function newParagraphAtEnd(page: Page) {
  const editor = page.getByRole('textbox', { name: 'Visual document', exact: true });
  const last = editor.locator(':scope > p').last();
  await expect(async () => {
    if ((await last.textContent()) !== '') {
      await editor.press('ControlOrMeta+End');
      await editor.press('Enter');
    }
    await expect(last).toHaveText('', { timeout: 1000 });
  }).toPass({ timeout: 15_000 });
}

export { expect };
export type { Page };
