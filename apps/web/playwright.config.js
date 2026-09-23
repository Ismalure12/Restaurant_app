const { defineConfig, devices } = require('@playwright/test');

// E2E_BASE_URL points the suite at an already-running app (e.g. a scratch
// web+API on a throwaway database). Without it, the local dev server on :3100
// is used/started. Never point write tests at the live database.
const baseURL = process.env.E2E_BASE_URL || 'http://localhost:3100';

module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: false,
  retries: 1,
  timeout: 30000,
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'Desktop Chrome',
      use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    },
    {
      // Phone layout + touch in Chromium (no extra browser download needed).
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 7'] },
    },
    {
      // Needs `npx playwright install webkit`.
      name: 'Mobile Safari',
      use: { ...devices['iPhone 13'] },
    },
  ],
  webServer: process.env.E2E_BASE_URL ? undefined : {
    command: 'npm run dev',
    url: baseURL,
    reuseExistingServer: true,
    timeout: 60000,
  },
});
