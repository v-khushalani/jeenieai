import fs from 'node:fs';
import path from 'node:path';
import { expect, type Browser, type Page } from '@playwright/test';
import { ACCOUNTS, PASSWORD, type Role } from './accounts';

const STATE_DIR = path.join(process.cwd(), 'e2e', '.auth');

export function stateFile(role: Role) {
  return path.join(STATE_DIR, `${role}.json`);
}

/** Fill the real login form. Throws a readable error if the credentials fail. */
export async function login(page: Page, role: Role) {
  if (!PASSWORD) {
    throw new Error('E2E_PASSWORD is not set — export it before running the suite.');
  }
  const { email } = ACCOUNTS[role];

  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(PASSWORD);
  await page.locator('form').getByRole('button', { name: /sign in/i }).click();

  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 45_000 })
    .catch(() => { throw new Error(`Login failed for ${role} (${email}) — still on /login`); });

  await expect(page).not.toHaveURL(/\/login/);
}

/**
 * Returns a cached storageState path for the role, logging in once per run.
 */
export async function sessionFor(browser: Browser, role: Role): Promise<string> {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const file = stateFile(role);
  if (fs.existsSync(file)) return file;

  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await login(page, role);
    await context.storageState({ path: file });
  } finally {
    await context.close();
  }
  return file;
}

/** True when the current page is the 404 screen. */
export async function isNotFound(page: Page) {
  return (await page.getByText('Oops! Page not found').count()) > 0;
}

/** True when the app crashed into the error boundary. */
export async function isErrorBoundary(page: Page) {
  return (await page.getByText(/something went wrong/i).count()) > 0;
}

/** True when the page rendered essentially nothing (dead end). */
export async function isBlank(page: Page) {
  const text = (await page.locator('body').innerText().catch(() => '')) || '';
  return text.trim().length < 20;
}
