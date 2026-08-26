import { test, expect, type Browser } from '@playwright/test';
import { isBlank, isErrorBoundary, isNotFound, sessionFor } from '../fixtures/auth';
import { reportIssues, watchPage } from '../fixtures/console';

const ROUTES = ['/dashboard', '/ai-planner', '/practice', '/tests', '/profile'];

async function mobilePage(browser: Browser) {
  const context = await browser.newContext({
    storageState: await sessionFor(browser, 'proplus'),
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  return { context, page, issues: watchPage(page) };
}

test.describe('mobile 390px pass', () => {
  for (const route of ROUTES) {
    test(`${route} works at 390px`, async ({ browser }, testInfo) => {
      const { context, page, issues } = await mobilePage(browser);
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3000);
      await reportIssues(testInfo, page, issues);

      const notFound = await isNotFound(page);
      const crashed = await isErrorBoundary(page);
      const blank = await isBlank(page);

      // Horizontal overflow is a real mobile dead end (content off-screen).
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );

      await context.close();
      expect(notFound).toBe(false);
      expect(crashed).toBe(false);
      expect(blank).toBe(false);
      expect(overflow, `${route} overflows horizontally by ${overflow}px`).toBeLessThanOrEqual(8);
    });
  }
});
