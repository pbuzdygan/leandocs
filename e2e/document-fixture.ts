import { expect, test as base } from '@playwright/test';
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

export { expect };
export type { Page } from '@playwright/test';
