// e2e/helpers.ts — shared route list and an axe runner for the a11y specs.
import { type Page, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/** Every route the a11y matrix scans, in both themes. */
export const ROUTES: readonly { path: string; h1: RegExp }[] = [
  { path: '/', h1: /Copa Copilot/ },
  { path: '/onboarding', h1: /Set up Copa Copilot/ },
  { path: '/map', h1: /Stadium map/ },
  { path: '/assistant', h1: /Assistant/i },
  { path: '/ops', h1: /Operations/ },
  { path: '/volunteer', h1: /Volunteer/ },
  { path: '/missions', h1: /missions/i },
  { path: '/leaderboard', h1: /Leaderboards/ },
  { path: '/accessibility', h1: /Accessibility/ },
  { path: '/google-services', h1: /Google services/ },
];

/** Run axe with WCAG 2.1 A/AA rules and assert zero violations. */
export async function expectNoAxeViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(
    results.violations,
    results.violations.map((v) => `${v.id}: ${v.help}`).join('\n'),
  ).toEqual([]);
}
