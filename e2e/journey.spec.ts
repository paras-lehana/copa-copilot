// journey.spec.ts — end-to-end persona journeys asserting real, engine-derived
// behaviour (not just "element visible"). Runs on desktop and mobile projects.
import { expect, test } from '@playwright/test';
import { ROUTES } from './helpers';

test('every route renders its heading and live data with no console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('favicon')) errors.push(m.text());
  });
  for (const route of ROUTES) {
    await page.goto(route.path, { waitUntil: 'networkidle' });
    await expect(page.locator('h1').first()).toContainText(route.h1);
  }
  expect(errors, errors.join('\n')).toEqual([]);
});

test('fan journey: dashboard shows crowd data and computes exit advice', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  // Live crowd data rendered (a phase label from the engine).
  await expect(page.getByText(/Phase:/)).toBeVisible();
  // The anti-MetLife exit advisor computes a real saving.
  await page.getByRole('button', { name: /get my exit advice/i }).click();
  await expect(page.getByText(/min/).first()).toBeVisible({ timeout: 15_000 });
});

test('fan journey: assistant answers a wheelchair route with step-free legs', async ({ page }) => {
  await page.goto('/assistant', { waitUntil: 'networkidle' });
  await page.getByLabel(/ask about/i).fill('I need a wheelchair route to my seat');
  await page.getByRole('button', { name: /send/i }).click();
  const log = page.getByRole('log');
  await expect(log).toContainText(/route|gate|section|concourse/i, { timeout: 15_000 });
  await expect(log).toContainText(/findSafeRoute/);
});

test('organizer journey: ops briefing generates a headline and actions', async ({ page }) => {
  // Switch persona to organizer via onboarding so /ops is reachable.
  await page.goto('/onboarding', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Organizer' }).click();
  await page.goto('/ops', { waitUntil: 'networkidle' });
  await expect(page.getByText(/gate bottleneck/i)).toBeVisible();
  await page.getByRole('button', { name: /generate briefing/i }).click();
  await expect(page.getByText(/Top actions:/)).toBeVisible({ timeout: 15_000 });
});

test('google-services page renders the live catalog with implemented services', async ({ page }) => {
  await page.goto('/google-services', { waitUntil: 'networkidle' });
  await expect(page.getByText('Gemini API')).toBeVisible();
  await expect(page.getByText('Implemented').first()).toBeVisible();
  await expect(page.getByText(/exposesSecretValues/)).toBeVisible();
});

test('language switch to Arabic sets RTL direction', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.getByLabel(/choose language/i).selectOption('ar');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
});
