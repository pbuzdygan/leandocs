import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

/** WCAG 2.0/2.1/2.2 A and AA rules (UI_SPEC §97); best practices are reviewed by hand. */
const WCAG_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/**
 * Fail with a readable list when axe finds WCAG AA violations on the current page.
 * `include` limits the scan to an open dialog or menu so the page behind it is not scanned twice.
 */
export async function expectAccessible(page: Page, screen: string, include?: string) {
  let builder = new AxeBuilder({ page }).withTags(WCAG_AA);
  if (include) builder = builder.include(include);
  const { violations } = await builder.analyze();
  const report = violations.map(
    (violation) =>
      `${violation.id} (${violation.impact}): ${violation.help}\n` +
      violation.nodes
        .slice(0, 5)
        .map(
          (node) => `    ${node.target.join(' ')} — ${node.failureSummary?.split('\n')[1]?.trim()}`,
        )
        .join('\n'),
  );
  // Soft: one run reports every screen with problems, not just the first.
  expect.soft(report, `${screen}: accessibility violations`).toEqual([]);
}
