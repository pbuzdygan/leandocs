import { expectAccessible } from './axe';
import { expect, newParagraphAtEnd, test } from './document-fixture';
import { restoreSettingsAfterEach, setDefaultEditor } from './settings';

restoreSettingsAfterEach();

/**
 * P15-08 accessibility review (UI_SPEC §97, WCAG AA): automated axe scans of every screen,
 * menu and dialog, plus keyboard checks that axe cannot do. Setup screens are scanned in
 * `setup.spec.ts` because they exist only on the first run.
 */

const RICH = [
  '# Accessible Page',
  '',
  'Intro with **bold**, `code`, a [[Accessible Target]] link and a [[Missing Page]].',
  '',
  '## Table',
  '',
  '| Key | Value |',
  '| --- | ----- |',
  '| CPU | N100  |',
  '',
  '- [x] Done item',
  '- [ ] Open item',
  '',
  ':::warning',
  'Careful.',
  ':::',
  '',
  '```bash',
  'echo hello',
  '```',
  '',
  '```mermaid',
  'flowchart LR',
  '  A[Internet] --> B[Router]',
  '```',
  '',
  '> A quote.',
  '',
  'Last paragraph.',
  '',
].join('\n');

/**
 * The scans run in both themes (P16-03). The theme setting stays "System", so the emulated system
 * colour scheme decides which one the app shows.
 */
for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`${colorScheme} theme`, () => {
    test.use({ colorScheme });

    test('document screens, menus and dialogs have no WCAG AA violations', async ({
      page,
      createDocument,
    }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await createDocument('Accessible Target', '# Accessible Target\n\nLinked from elsewhere.\n');
      const id = await createDocument('Accessible Page', RICH);

      await page.goto('/');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expectAccessible(page, 'home');

      await page.goto(`/doc/${id}`);
      await expect(page.getByRole('heading', { level: 1, name: 'Accessible Page' })).toBeVisible();
      await expect(page.locator('.mermaid-diagram svg, .mermaid svg').first()).toBeVisible();
      await expectAccessible(page, 'document view');

      await page.getByRole('tab', { name: 'Source', exact: true }).click();
      await expectAccessible(page, 'document source view');
      await page.getByRole('tab', { name: 'View', exact: true }).click();

      for (const tab of ['Info', 'Links']) {
        await page.getByRole('tab', { name: tab, exact: true }).click();
        await expectAccessible(page, `context panel: ${tab}`);
      }

      await page.getByRole('button', { name: 'More actions' }).click();
      await expect(page.getByRole('menu')).toBeVisible();
      await expectAccessible(page, 'document menu', '[role="menu"]');
      await page.getByRole('menuitem', { name: 'Move', exact: true }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await expectAccessible(page, 'move dialog', '[role="dialog"]');
      await page.keyboard.press('Escape');

      await page.getByRole('treeitem', { name: 'Accessible Page', exact: true }).click({
        button: 'right',
      });
      await expect(page.getByRole('menu')).toBeVisible();
      await expectAccessible(page, 'tree context menu', '[role="menu"]');
      await page.keyboard.press('Escape');

      await page.getByRole('button', { name: 'New', exact: true }).click();
      await expect(page.getByRole('dialog', { name: 'New document' })).toBeVisible();
      await expectAccessible(page, 'new document dialog', '[role="dialog"]');
      await page.keyboard.press('Escape');

      await page.keyboard.press('ControlOrMeta+k');
      await page.getByRole('combobox').fill('careful');
      await expect(page.getByRole('option').first()).toBeVisible();
      await expectAccessible(page, 'search palette', '[role="dialog"]');
      await page.keyboard.press('Escape');

      await page.getByRole('button', { name: 'User menu' }).click();
      await expectAccessible(page, 'user menu', '[role="menu"]');
      await page.keyboard.press('Escape');
    });

    test('editors have no WCAG AA violations', async ({ page, createDocument }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      const id = await createDocument('Accessible Editing', RICH);

      await setDefaultEditor(page, 'visual');
      await page.goto(`/doc/${id}/edit`);
      await expect(page.getByRole('status', { name: 'Save status' })).toHaveText('Saved');
      await expect(page.locator('.ProseMirror')).toContainText('Careful.');
      await expect(page.getByRole('button', { name: 'Code block', exact: true })).toBeEnabled();
      await expectAccessible(page, 'visual editor');

      await newParagraphAtEnd(page);
      await page.keyboard.type('/');
      await expect(page.getByRole('menu', { name: 'Insert block' })).toBeVisible();
      await expectAccessible(page, 'slash menu');
      await page.keyboard.press('Escape');

      await page.getByRole('tab', { name: 'Source' }).click();
      await expect(page.locator('.cm-content')).toContainText('Careful.');
      await expectAccessible(page, 'source editor');
      await page.getByRole('button', { name: 'Done' }).click();
    });

    test('settings, not found and the mobile layout have no WCAG AA violations', async ({
      page,
    }) => {
      for (const section of [
        'general',
        'editor',
        'appearance',
        'storage',
        'index',
        'links',
        'security',
        'about',
      ]) {
        await page.goto(`/settings/${section}`);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        await expectAccessible(page, `settings: ${section}`);
      }

      await page.goto('/no-such-page');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expectAccessible(page, 'not found');

      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto('/');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expectAccessible(page, 'mobile home');
      await page.getByRole('button', { name: 'Open navigation' }).click();
      await expect(
        page.getByRole('navigation', { name: 'Documentation navigation' }),
      ).toBeInViewport();
      await expectAccessible(page, 'mobile navigation drawer');
    });

    test('the sign-in page has no WCAG AA violations', async ({ browser }) => {
      const context = await browser.newContext({
        storageState: { cookies: [], origins: [] },
        colorScheme,
      });
      const page = await context.newPage();
      await page.goto('http://127.0.0.1:18765/login');
      await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
      await expectAccessible(page, 'sign in');
      await page.getByLabel('Username').fill('admin');
      await page.getByLabel('Password', { exact: true }).fill('incorrect password');
      await page.getByRole('button', { name: 'Sign in', exact: true }).click();
      await expect(page.getByRole('alert')).toBeVisible();
      await expectAccessible(page, 'sign in error');
      await context.close();
    });
  });
}

/** WCAG 1.4.10 Reflow: at 320 CSS px only tables and code scroll sideways, never the page. */
test('pages reflow to 320 px without horizontal page scrolling', async ({
  page,
  createDocument,
}) => {
  const id = await createDocument('Reflow Check', RICH);
  await page.setViewportSize({ width: 320, height: 640 });
  for (const url of [`/doc/${id}`, `/doc/${id}/edit`, '/settings/storage', '/settings/about']) {
    await page.goto(url);
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(width, url).toBeLessThanOrEqual(320);
  }
});

test('every Tab stop shows a visible focus indicator', async ({ page, createDocument }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const id = await createDocument('Focus Walk', RICH);
  await page.goto(`/doc/${id}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Focus Walk' })).toBeVisible();

  const invisible: string[] = [];
  const seen = new Set<string>();
  for (let n = 0; n < 60; n++) {
    await page.keyboard.press('Tab');
    const stop = await page.evaluate(() => {
      const element = document.activeElement as HTMLElement | null;
      if (!element || element === document.body) return undefined;
      const style = getComputedStyle(element);
      const outline = style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) >= 1;
      const name =
        element.getAttribute('aria-label') ?? element.textContent?.trim().slice(0, 40) ?? '';
      return {
        key: `${element.tagName.toLowerCase()}.${element.className} "${name}"`,
        visible: outline || style.boxShadow !== 'none',
      };
    });
    if (!stop) continue;
    if (seen.has(stop.key)) break; // Wrapped around to the start.
    seen.add(stop.key);
    if (!stop.visible) invisible.push(stop.key);
  }
  expect(seen.size).toBeGreaterThan(10);
  expect(invisible).toEqual([]);
});

test('dialogs and search work from the keyboard and return focus', async ({
  page,
  createDocument,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await createDocument('Keyboard Target', '# Keyboard Target\n\nFind the walrus here.\n');
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  const newButton = page.getByRole('button', { name: 'New', exact: true });
  await newButton.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'New document' });
  await expect(dialog.getByLabel('Name')).toBeFocused();
  // Focus stays inside the open dialog.
  for (let n = 0; n < 8; n++) {
    await page.keyboard.press('Tab');
    expect(await dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(newButton).toBeFocused();

  // A dialog chosen from a menu returns focus to the menu's button.
  await page
    .getByRole('link', { name: /Keyboard Target/ })
    .first()
    .click();
  const more = page.getByRole('button', { name: 'More actions' });
  await more.focus();
  await page.keyboard.press('Enter');
  await page.getByRole('menuitem', { name: 'Rename', exact: true }).focus();
  await page.keyboard.press('Enter');
  const rename = page.getByRole('dialog', { name: /Rename/ });
  await expect(rename).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(rename).toBeHidden();
  await expect(more).toBeFocused();

  await page.keyboard.press('ControlOrMeta+k');
  const input = page.getByRole('combobox');
  await expect(input).toBeFocused();
  await input.fill('walrus');
  await expect(page.getByRole('option').first()).toContainText('Keyboard Target');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 1, name: 'Keyboard Target' })).toBeVisible();
});
