// a11y.spec.ts — M33 accessibility column: axe on EVERY route in BOTH themes.
// The dark-theme pass is deliberate — the historical −4 contrast bug only appeared
// in dark mode, so a single-theme scan would have missed it.
import { test } from '@playwright/test';
import { ROUTES, expectNoAxeViolations } from './helpers';

for (const theme of ['light', 'dark'] as const) {
  test.describe(`axe — ${theme} theme`, () => {
    test.use({ colorScheme: theme });
    for (const route of ROUTES) {
      test(`${route.path} has no WCAG A/AA violations (${theme})`, async ({ page }) => {
        await page.goto(route.path, { waitUntil: 'networkidle' });
        await page.waitForTimeout(400);
        await expectNoAxeViolations(page);
      });
    }
  });
}
