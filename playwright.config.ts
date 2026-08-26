import fs from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8080';
const isLocal = BASE_URL.includes('localhost');

/**
 * Sandboxes/CI images often ship a system Chromium instead of Playwright's
 * bundled build. Prefer an explicit path, then the system binary, else default.
 */
const CHROMIUM_PATH =
  process.env.E2E_CHROMIUM_PATH ||
  ['/usr/bin/chromium', '/bin/chromium', '/usr/bin/google-chrome'].find((p) => fs.existsSync(p));

const launchOptions = CHROMIUM_PATH ? { executablePath: CHROMIUM_PATH } : {};


export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    actionTimeout: 15_000,
    navigationTimeout: 45_000,
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 }, launchOptions },
    },
    {
      name: 'mobile',
      testMatch: '**/smoke-mobile.spec.ts',
      use: { ...devices['Pixel 5'], viewport: { width: 390, height: 844 }, launchOptions },
    },
  ],
  webServer: isLocal
    ? {
        command: 'npm run dev',
        url: BASE_URL,
        reuseExistingServer: true,
        timeout: 120_000,
      }
    : undefined,
});
