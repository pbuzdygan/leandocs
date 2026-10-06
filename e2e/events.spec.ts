import { rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import type { ContentChanges } from '../packages/shared/src/events.js';

test('authenticated EventSource receives indexed external changes under the app security policy', async ({
  page,
}) => {
  const file = path.resolve(import.meta.dirname, '../.e2e-data/content/SSE external.md');
  const received: ContentChanges[] = [];
  await page.exposeFunction('receiveExternalChange', (changes: ContentChanges) =>
    received.push(changes),
  );
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'New', exact: true })).toBeVisible();
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const events = new EventSource('/api/v1/events');
        events.addEventListener('ready', () => resolve());
        events.addEventListener('content-changed', (event) => {
          const bridge = window as unknown as {
            receiveExternalChange: (changes: ContentChanges) => void;
          };
          bridge.receiveExternalChange(
            JSON.parse((event as MessageEvent<string>).data) as ContentChanges,
          );
          events.close();
        });
        events.onerror = () => {
          events.close();
          reject(new Error('Event stream failed'));
        };
      }),
  );
  try {
    await writeFile(file, '---\nid: sse-external-document\n---\n# External event\n');
    await expect
      .poll(() => received.flatMap((changes) => changes.documents))
      .toContainEqual({
        kind: 'added',
        id: 'sse-external-document',
        path: 'SSE external.md',
      });
    const tree = await page.request.get('/api/v1/tree');
    expect((await tree.json()).root.children).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'sse-external-document' })]),
    );
  } finally {
    await rm(file, { force: true });
  }
});
