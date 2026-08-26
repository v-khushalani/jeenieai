import { test, expect, type Browser } from '@playwright/test';
import { ACCOUNTS, ALL_ROLES, COMMON_ROUTES, FORBIDDEN_ROUTES, ROLE_ROUTES, type Role } from '../fixtures/accounts';
import { isBlank, isErrorBoundary, isNotFound, sessionFor } from '../fixtures/auth';
import { reportIssues, watchPage } from '../fixtures/console';

async function pageFor(browser: Browser, role: Role) {
  const context = await browser.newContext({ storageState: await sessionFor(browser, role) });
  const page = await context.newPage();
  return { context, page, issues: watchPage(page) };
}

test.describe('public routes', () => {
  const PUBLIC = ['/', '/why-us', '/faq', '/privacy-policy', '/terms-of-service', '/refund-policy', '/login', '/signup'];

  for (const route of PUBLIC) {
    test(`public ${route} renders`, async ({ page }, testInfo) => {
      const issues = watchPage(page);
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1200);
      await reportIssues(testInfo, page, issues);

      expect(await isNotFound(page), `${route} rendered 404`).toBe(false);
      expect(await isErrorBoundary(page), `${route} crashed`).toBe(false);
      expect(await isBlank(page), `${route} rendered blank`).toBe(false);
      expect(issues.pageErrors, `${route} threw`).toEqual([]);
    });
  }

  test('unknown route shows the 404 page, not a crash', async ({ page }) => {
    await page.goto('/this-route-does-not-exist', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Oops! Page not found')).toBeVisible();
    await expect(page.getByRole('link', { name: /return to home/i })).toBeVisible();
  });
});

for (const role of ALL_ROLES) {
  test.describe(`${ACCOUNTS[role].label} (${role})`, () => {
    test(`logs in and lands off /login`, async ({ browser }) => {
      const { context, page } = await pageFor(browser, role);
      await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1500);
      await expect(page).not.toHaveURL(/\/login/);
      await context.close();
    });

    const routes = [...COMMON_ROUTES, ...ROLE_ROUTES[role]];
    for (const route of routes) {
      test(`${route} is reachable`, async ({ browser }, testInfo) => {
        const { context, page, issues } = await pageFor(browser, role);
        await page.goto(route, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(6000);
        await reportIssues(testInfo, page, issues);

        const notFound = await isNotFound(page);
        const crashed = await isErrorBoundary(page);
        const blank = await isBlank(page);
        const bouncedToLogin = /\/login/.test(page.url());
        await context.close();

        expect(notFound, `${route} rendered 404 for ${role}`).toBe(false);
        expect(crashed, `${route} crashed for ${role}`).toBe(false);
        expect(blank, `${route} rendered blank for ${role}`).toBe(false);
        expect(bouncedToLogin, `${route} bounced ${role} to /login`).toBe(false);
      });
    }

    for (const route of FORBIDDEN_ROUTES[role]) {
      test(`${route} is gated`, async ({ browser }) => {
        const { context, page } = await pageFor(browser, role);
        await page.goto(route, { waitUntil: 'domcontentloaded' });
        // Role checks resolve after the session + role query settle.
        await page.waitForTimeout(8000);
        const url = new URL(page.url());
        const redirectedAway = !url.pathname.startsWith(route);
        const deniedInPlace =
          (await page.getByText(/access denied|not authorized|unauthorized|permission/i).count()) > 0;
        await context.close();
        expect(redirectedAway || deniedInPlace, `${role} was NOT blocked from ${route}`).toBe(true);
      });
    }

    test('in-app links do not dead-end', async ({ browser }, testInfo) => {
      const { context, page, issues } = await pageFor(browser, role);
      await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2500);

      const hrefs = await page.locator('a[href^="/"]').evaluateAll((els) =>
        Array.from(new Set(els.map((e) => (e as HTMLAnchorElement).getAttribute('href') || ''))),
      );

      const broken: string[] = [];
      for (const href of hrefs.filter(Boolean).slice(0, 25)) {
        await page.goto(href, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(1200);
        if (await isNotFound(page)) broken.push(`${href} → 404`);
        else if (await isErrorBoundary(page)) broken.push(`${href} → crash`);
        else if (await isBlank(page)) broken.push(`${href} → blank`);
      }

      await reportIssues(testInfo, page, issues);
      await context.close();
      expect(broken, `broken links for ${role}`).toEqual([]);
    });
  });
}
