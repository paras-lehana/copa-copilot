import { defineConfig, devices } from '@playwright/test';

// Playwright config. Single worker on Windows for Next dev-server stability
// (a documented flake fix). The webServer blocks bring up the API (demo mode) and
// the web app so `npm run e2e` is one command from a clean checkout.
const WEB_PORT = 3100;
const API_PORT = 8090;

export default defineConfig({
  testDir: './e2e',
  workers: 1,
  fullyParallel: false,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  timeout: 45_000,
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: [
    {
      command: `cross-env DEMO_MODE=true PORT=${API_PORT} SIM_SEED=26 ALLOWED_ORIGINS=http://localhost:${WEB_PORT} npm run dev -w @copa/api`,
      port: API_PORT,
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: `cross-env NEXT_PUBLIC_API_BASE_URL=http://localhost:${API_PORT} npm run dev -w @copa/web -- -p ${WEB_PORT}`,
      port: WEB_PORT,
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
