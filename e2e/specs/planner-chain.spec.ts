import { test, expect, type Browser, type Page } from '@playwright/test';
import { sessionFor } from '../fixtures/auth';
import { isBlank, isErrorBoundary, isNotFound } from '../fixtures/auth';
import { reportIssues, watchPage } from '../fixtures/console';
import type { Role } from '../fixtures/accounts';

const PLANNER_ROLES: Role[] = ['pro', 'proplus'];

async function openPlanner(browser: Browser, role: Role) {
  const context = await browser.newContext({ storageState: await sessionFor(browser, role) });
  const page = await context.newPage();
  const issues = watchPage(page);
  await page.goto('/ai-planner', { waitUntil: 'domcontentloaded' });
  await completeSetupIfShown(page);
  // Mission generation can take a while — wait for the chain or a usable fallback.
  await page
    .locator('[data-testid="mission-chain"], [data-testid="contract-sign"], [data-testid="contract-strip"]')
    .first()
    .waitFor({ state: 'visible', timeout: 60_000 })
    .catch(() => {});
  await page.waitForTimeout(2000);
  return { context, page, issues };
}

/** The first-run dialog blocks everything else — answer it if present. */
async function completeSetupIfShown(page: Page) {
  const dialog = page.getByRole('dialog');
  const visible = await dialog.isVisible().catch(() => false);
  if (!visible) return;
  if ((await page.getByText('2 quick questions').count()) === 0) return;

  await dialog.locator('button').filter({ hasText: /./ }).first().click();
  await page.getByText('Daily time').locator('xpath=following-sibling::div[1]').locator('button').first().click();
  await page.getByRole('button', { name: /build my challenges/i }).click();
  await expect(dialog).toBeHidden({ timeout: 60_000 });
}

test.describe('AI Planner — challenge chain', () => {
  test('free user is gated out of /ai-planner', async ({ browser }) => {
    const context = await browser.newContext({ storageState: await sessionFor(browser, 'free') });
    const page = await context.newPage();
    await page.goto('/ai-planner', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(8000);

    const onPlanner = new URL(page.url()).pathname.startsWith('/ai-planner');
    const upgradeShown =
      (await page.getByText(/upgrade|pro\b|unlock/i).count()) > 0;
    await context.close();

    expect(onPlanner && !upgradeShown, 'free user reached the planner with no upgrade prompt').toBe(false);
  });

  for (const role of PLANNER_ROLES) {
    test(`${role}: planner opens on the challenges tab`, async ({ browser }, testInfo) => {
      const { context, page, issues } = await openPlanner(browser, role);
      await reportIssues(testInfo, page, issues);

      const notFound = await isNotFound(page);
      const crashed = await isErrorBoundary(page);
      const blank = await isBlank(page);
      const chainVisible = await page.getByTestId('mission-chain').isVisible().catch(() => false);
      const emptyState = (await page.getByText(/challenges ready nahi hai/i).count()) > 0;
      await context.close();

      expect(notFound).toBe(false);
      expect(crashed).toBe(false);
      expect(blank).toBe(false);
      expect(chainVisible || emptyState, 'neither a chain nor a usable empty state rendered').toBe(true);
    });

    test(`${role}: exactly one challenge is active, rest locked`, async ({ browser }) => {
      const { context, page } = await openPlanner(browser, role);
      const hasChain = await page.getByTestId('mission-chain').isVisible().catch(() => false);
      test.skip(!hasChain, 'no chain generated for this account yet');

      const active = await page.getByTestId('mission-card-active').count();
      const locked = await page.getByTestId('mission-card-locked').count();
      const done = await page.getByTestId('mission-card-done').count();
      const total = active + locked + done;
      await context.close();

      expect(total, 'chain should have 2–6 challenges').toBeGreaterThanOrEqual(2);
      expect(total).toBeLessThanOrEqual(6);
      // Either one active challenge, or the whole chain is already done.
      expect(active === 1 || (active === 0 && done === total)).toBe(true);
    });

    test(`${role}: "Challenge accept" leads to a page that loads questions`, async ({ browser }, testInfo) => {
      const { context, page, issues } = await openPlanner(browser, role);
      const start = page.getByTestId('mission-start').first();
      const hasStart = await start.isVisible().catch(() => false);
      test.skip(!hasStart, 'no active challenge to start');

      await start.click();
      await page.waitForTimeout(6000);
      await reportIssues(testInfo, page, issues);

      const url = new URL(page.url()).pathname;
      const notFound = await isNotFound(page);
      const crashed = await isErrorBoundary(page);
      const deadEnd =
        (await page.getByText(/no questions|questions nahi|failed to load questions/i).count()) > 0;
      await context.close();

      expect(url.startsWith('/ai-planner'), 'start button did not navigate anywhere').toBe(false);
      expect(notFound, `challenge deep-link 404'd: ${url}`).toBe(false);
      expect(crashed, `challenge deep-link crashed: ${url}`).toBe(false);
      expect(deadEnd, `challenge deep-link had no questions: ${url}`).toBe(false);
    });

    test(`${role}: challenge details sheet opens with why/target/reward`, async ({ browser }) => {
      const { context, page } = await openPlanner(browser, role);
      const info = page.getByTestId('mission-info').first();
      const hasInfo = await info.isVisible().catch(() => false);
      test.skip(!hasInfo, 'no active challenge');

      await info.click();
      const sheet = page.getByRole('dialog');
      await expect(sheet.getByText('Kyun', { exact: true })).toBeVisible();
      await expect(sheet.getByText('Target', { exact: true })).toBeVisible();
      await expect(sheet.getByText('Reward', { exact: true })).toBeVisible();
      await context.close();
    });

    test(`${role}: mastery ladder tab renders`, async ({ browser }, testInfo) => {
      const { context, page, issues } = await openPlanner(browser, role);
      await page.getByRole('tab', { name: /mastery ladder/i }).click();
      await page.waitForTimeout(4000);
      await reportIssues(testInfo, page, issues);

      const crashed = await isErrorBoundary(page);
      const hasLadder = (await page.getByTestId('ladder-node-title').count()) > 0;
      const emptyLadder = (await page.getByText(/coming soon|no chapters/i).count()) > 0;
      await context.close();

      expect(crashed, 'ladder crashed').toBe(false);
      expect(hasLadder || emptyLadder, 'ladder rendered nothing usable').toBe(true);
    });
  }
});
