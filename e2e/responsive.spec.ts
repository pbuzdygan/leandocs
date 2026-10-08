import { expectAccessible } from './axe';
import { expect, test } from './document-fixture';

/** P16-02 (UI_SPEC §98–106): desktop, tablet and phone layouts. */

const BODY = [
  '# Overview',
  '',
  'Intro.',
  '',
  ...Array.from({ length: 6 }, (_, i) => [`## Section ${i + 1}`, '', 'Text.\n'.repeat(12)]).flat(),
].join('\n');

test('wide screens show the context panel beside the document', async ({
  page,
  createDocument,
}) => {
  const id = await createDocument('Layout Wide', BODY);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/doc/${id}`);
  await expect(page.getByRole('complementary', { name: 'Document context' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Contents, links and info' })).toHaveCount(0);
});

test('tablets open the context panel as a drawer from the document header', async ({
  page,
  createDocument,
}) => {
  const id = await createDocument('Layout Tablet', BODY);
  await page.setViewportSize({ width: 820, height: 1000 });
  await page.goto(`/doc/${id}`);
  // Navigation stays beside the document; the context panel is not shown inline.
  await expect(page.getByRole('navigation', { name: 'Documentation navigation' })).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Document context' })).toHaveCount(0);

  const opener = page.getByRole('button', { name: 'Contents, links and info' });
  await opener.click();
  const drawer = page.getByRole('dialog', { name: 'Document context' });
  await expect(drawer).toBeInViewport();
  await expectAccessible(page, 'context drawer');
  await page.keyboard.press('Escape');
  await expect(drawer).toHaveCount(0);
  await expect(opener).toBeFocused();

  // Choosing a heading closes the drawer, scrolls to the heading and moves focus there.
  await opener.click();
  await drawer.getByRole('link', { name: 'Section 5' }).click();
  await expect(drawer).toHaveCount(0);
  const heading = page.getByRole('heading', { name: 'Section 5' });
  await expect(heading).toBeInViewport();
  await expect(heading).toBeFocused();

  // The same drawer is available while editing.
  await page.goto(`/doc/${id}/edit`);
  await page
    .getByRole('region', { name: 'Editing' })
    .getByRole('button', { name: 'Contents, links and info' })
    .click();
  await drawer.getByRole('tab', { name: 'Info' }).click();
  await expect(drawer.getByText('Layout Tablet.md')).toBeVisible();
});

test('phones: the navigation drawer is keyboard friendly and closes after navigating', async ({
  page,
  createDocument,
}) => {
  const id = await createDocument('Layout Phone', BODY);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/doc/${id}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Layout Phone' })).toBeVisible();

  // A closed drawer is off-screen, inert (out of the tab order and the accessibility tree).
  const nav = page.locator('#navigation-drawer');
  await expect(nav).not.toBeInViewport();
  await expect(nav).toHaveAttribute('inert');
  for (let n = 0; n < 12; n++) {
    await page.keyboard.press('Tab');
    const inDrawer = await page.evaluate(
      () => document.activeElement?.closest('#navigation-drawer') !== null,
    );
    expect(inDrawer).toBe(false);
  }

  const menu = page.getByRole('button', { name: 'Open navigation' });
  await menu.click();
  await expect(nav).toBeInViewport();
  await expect(nav).not.toHaveAttribute('inert');
  await expect(nav.getByRole('treeitem', { name: /Layout Phone/ })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(nav).toHaveAttribute('inert');
  await expect(page.getByRole('button', { name: 'Open navigation' })).toBeFocused();

  // The reading-width toggle is not offered on phones.
  await expect(page.getByRole('button', { name: /Use (reading|full) width/ })).toBeHidden();

  // Leaving through the drawer closes it.
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page).toHaveURL(/\/settings\//);
  await expect(nav).toHaveAttribute('inert');
  await expect(nav).not.toBeInViewport();
});

test('phones: the editing bar keeps every control on screen', async ({ page, createDocument }) => {
  const id = await createDocument('Layout Phone Edit', BODY);
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 700 });
    await page.goto(`/doc/${id}/edit`);
    const bar = page.getByRole('region', { name: 'Editing' });
    for (const name of ['Save', 'Done', 'More actions', 'Contents, links and info']) {
      const box = await bar.getByRole('button', { name, exact: true }).boundingBox();
      expect(box, `${name} at ${width} px`).not.toBeNull();
      expect(box!.x + box!.width, `${name} at ${width} px`).toBeLessThanOrEqual(width);
    }
    await expect(bar.getByRole('status', { name: 'Save status' })).toBeInViewport();
  }
});

test('the navigation sidebar can be resized by dragging and hidden on wide screens (UI_SPEC §160)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const sidebar = page.getByRole('navigation', { name: 'Documentation navigation' });
  await expect(sidebar).toBeVisible();
  const separator = page.getByRole('separator', { name: 'Resize navigation' });
  const box = (await separator.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + 200);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + 200, { steps: 5 });
  await page.mouse.up();
  await expect(separator).toHaveAttribute('aria-valuenow', '340');
  expect(Math.round((await sidebar.boundingBox())!.width)).toBe(340);
  await page.reload();
  await expect(page.getByRole('separator', { name: 'Resize navigation' })).toHaveAttribute(
    'aria-valuenow',
    '340',
  );

  await page.getByRole('button', { name: 'Hide navigation' }).click();
  await expect(sidebar).toBeHidden();
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(sidebar).toBeHidden();
  await page.getByRole('button', { name: 'Show navigation' }).click();
  await expect(sidebar).toBeVisible();
  // Leave the defaults for later tests (local storage of this test's browser context only).
  await separator.dblclick();
  await expect(separator).toHaveAttribute('aria-valuenow', '280');
});
