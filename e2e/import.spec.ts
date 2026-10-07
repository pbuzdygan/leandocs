import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from './document-fixture';
import { csrfRequest } from './csrf-request';

const content = path.resolve(import.meta.dirname, '../.e2e-data/content');

/** Phase 13 acceptance: an existing Markdown library is imported without copying by hand. */
test('imports a Markdown directory through the preview and keeps its structure', async ({
  page,
}) => {
  const source = await mkdtemp(path.join(tmpdir(), 'leandocs-import-'));
  const library = path.join(source, 'Homelab');
  const router =
    '---\ntitle: Edge router\ntags: [network]\n---\n\n# Edge router\n\nSee [[NAS]].\n\n![Topology](../diagram.png)\n';
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aSf8AAAAASUVORK5CYII=',
    'base64',
  );
  const destination = path.join(content, 'Imported Library');
  try {
    await mkdir(path.join(library, 'Network'), { recursive: true });
    await mkdir(path.join(library, '.git'), { recursive: true });
    await writeFile(path.join(library, 'Network/Router.md'), router);
    await writeFile(path.join(library, 'NAS.md'), '# NAS\n\nStorage notes.\n');
    await writeFile(path.join(library, 'diagram.png'), png);
    await writeFile(path.join(library, 'unused.png'), png);
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
      '2 documents and 1 attachment will be imported into Imported Library. 2 new folders · 1 skipped.',
    );
    await expect(preview.getByText('Left out 1 file in hidden folders (.git).')).toBeVisible();
    await expect(preview.getByRole('row', { name: /Homelab\/diagram\.png/ })).toContainText(
      'Attachment of Homelab/Network/Router.md',
    );
    await expect(preview.getByRole('row', { name: /Homelab\/unused\.png/ })).toContainText(
      'Not used by any imported document',
    );
    // The preview writes nothing.
    expect(await readdir(destination)).toEqual([]);

    await preview.getByRole('button', { name: 'Import 2 documents' }).click();
    const finished = page.getByRole('dialog', { name: 'Import finished' });
    await expect(finished.getByRole('status')).toHaveText(
      '2 documents and 1 attachment imported into Imported Library. 2 new folders · 1 skipped.',
    );
    await finished.getByRole('button', { name: 'Done' }).click();
    expect(
      await readFile(path.join(destination, 'Homelab/Network/Router.assets/diagram.png')),
    ).toEqual(png);
    expect(await readdir(path.join(destination, 'Homelab'))).toEqual(['NAS.md', 'Network']);

    const imported = await readFile(path.join(destination, 'Homelab/Network/Router.md'), 'utf8');
    expect(imported).toMatch(/^---\ntitle: Edge router\ntags: \[network\]\nid: [0-9a-f-]{36}\n/);
    expect(
      imported.endsWith(
        '---\n\n# Edge router\n\nSee [[NAS]].\n\n![Topology](Router.assets/diagram.png)\n',
      ),
    ).toBe(true);
    // The copied image renders in the imported document.
    const id = /\nid: (\S+)\n/.exec(imported)![1]!;
    await page.goto(`/doc/${id}`);
    const image = page.getByRole('img', { name: 'Topology' });
    await expect(image).toBeVisible();
    await expect
      .poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth))
      .toBe(1);
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

test('converts an HTML file, reports what was removed and opens the new document', async ({
  page,
  createDocument,
}) => {
  // A non-empty library shows the Home quick actions (an empty one offers "Import Markdown").
  await createDocument('Import neighbour', '# Neighbour\n');
  const source = await mkdtemp(path.join(tmpdir(), 'leandocs-html-'));
  const html = path.join(source, 'Legacy wiki page.html');
  const target = path.join(content, 'Legacy wiki page.md');
  try {
    await writeFile(
      html,
      '<html><head><title>Legacy wiki</title></head><body><h1>Legacy wiki</h1>' +
        '<p>Restart the <b>router</b> first.</p><script>alert("x")</script></body></html>',
    );
    await page.goto('/');
    await page.getByRole('button', { name: 'Import', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Import documentation' });
    await dialog.getByRole('radio', { name: /HTML files/ }).check();
    const chooser = page.waitForEvent('filechooser');
    await dialog.getByRole('button', { name: 'Select files' }).click();
    await (await chooser).setFiles(html);

    const preview = page.getByRole('dialog', { name: 'Import preview' });
    const row = preview.getByRole('row', { name: /Legacy wiki page\.html/ });
    await expect(row).toContainText('Converted');
    await expect(row).toContainText('Removed a script that Markdown cannot contain');
    await preview.getByRole('button', { name: 'Import 1 document' }).click();
    await page
      .getByRole('dialog', { name: 'Import finished' })
      .getByRole('button', { name: 'Done' })
      .click();

    await expect(page.getByRole('heading', { level: 1, name: 'Legacy wiki' })).toBeVisible();
    await expect(page.locator('.doc__content strong, article strong').first()).toHaveText('router');
    const markdown = await readFile(target, 'utf8');
    expect(markdown).toContain('Restart the **router** first.');
    expect(markdown).not.toContain('alert');
    // The HTML original stays where it was; nothing HTML is stored in the documentation.
    expect(await readFile(html, 'utf8')).toContain('<script>');
  } finally {
    await rm(source, { recursive: true, force: true });
    await rm(target, { force: true });
  }
});
