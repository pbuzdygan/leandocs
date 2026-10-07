import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { csrfRequest } from './csrf-request';

const content = path.resolve(import.meta.dirname, '../.e2e-data/content');

/** Phase 13 acceptance: an existing Markdown library is imported without copying by hand. */
test('imports a Markdown directory through the preview and keeps its structure', async ({
  page,
}) => {
  const source = await mkdtemp(path.join(tmpdir(), 'leandocs-import-'));
  const library = path.join(source, 'Homelab');
  const router = '---\ntitle: Edge router\ntags: [network]\n---\n\n# Edge router\n\nSee [[NAS]].\n';
  const destination = path.join(content, 'Imported Library');
  try {
    await mkdir(path.join(library, 'Network'), { recursive: true });
    await mkdir(path.join(library, '.git'), { recursive: true });
    await writeFile(path.join(library, 'Network/Router.md'), router);
    await writeFile(path.join(library, 'NAS.md'), '# NAS\n\nStorage notes.\n');
    await writeFile(path.join(library, 'diagram.png'), 'not imported yet');
    await writeFile(path.join(library, '.git/HEAD'), 'ref: refs/heads/main\n');
    const folder = await csrfRequest(page.request).post('/api/v1/folders', {
      data: { name: 'Imported Library' },
    });
    expect(folder.status()).toBe(201);

    await page.goto('/');
    await page.getByRole('button', { name: 'Import', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Import documentation' });
    await dialog.getByLabel('Import into').selectOption('Imported Library');
    const chooser = page.waitForEvent('filechooser');
    await dialog.getByRole('button', { name: 'Select files' }).click();
    await (await chooser).setFiles(library);

    const preview = page.getByRole('dialog', { name: 'Import preview' });
    await expect(preview.getByRole('status')).toHaveText(
      '2 documents will be imported into Imported Library. 2 new folders · 1 skipped.',
    );
    await expect(preview.getByText('Left out 1 file in hidden folders (.git).')).toBeVisible();
    await expect(preview.getByRole('row', { name: /Homelab\/diagram\.png/ })).toContainText(
      'Only Markdown files are imported',
    );
    // The preview writes nothing.
    expect(await readdir(destination)).toEqual([]);

    await preview.getByRole('button', { name: 'Import 2 documents' }).click();
    const finished = page.getByRole('dialog', { name: 'Import finished' });
    await expect(finished.getByRole('status')).toHaveText(
      '2 documents imported into Imported Library. 2 new folders · 1 skipped.',
    );
    await finished.getByRole('button', { name: 'Done' }).click();

    const imported = await readFile(path.join(destination, 'Homelab/Network/Router.md'), 'utf8');
    expect(imported).toMatch(/^---\ntitle: Edge router\ntags: \[network\]\nid: [0-9a-f-]{36}\n/);
    expect(imported.endsWith('---\n\n# Edge router\n\nSee [[NAS]].\n')).toBe(true);
    const tree = page.getByRole('tree', { name: 'Documentation' });
    await expect(tree.getByRole('treeitem', { name: 'Homelab' })).toBeVisible();
    await page.keyboard.press('ControlOrMeta+k');
    await page.getByRole('combobox', { name: 'Search documentation' }).fill('storage notes');
    await expect(page.getByRole('option', { name: /NAS/ })).toBeVisible();
  } finally {
    await rm(source, { recursive: true, force: true });
    await rm(destination, { recursive: true, force: true });
  }
});
