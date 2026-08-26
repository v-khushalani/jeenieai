import { test, expect, type Browser } from '@playwright/test';
import { sessionFor } from '../fixtures/auth';
import { reportIssues, watchPage } from '../fixtures/console';
import type { Role } from '../fixtures/accounts';

const ROLE: Role = 'pro';

async function openPlanner(browser: Browser, role: Role) {
  const context = await browser.newContext({ storageState: await sessionFor(browser, role) });
  const page = await context.newPage();
  const issues = watchPage(page);
  await page.goto('/ai-planner', { waitUntil: 'domcontentloaded' });
  await page
    .locator('[data-testid="contract-sign"], [data-testid="contract-strip"]')
    .first()
    .waitFor({ state: 'visible', timeout: 60_000 })
    .catch(() => {});
  await page.waitForTimeout(1500);
  return { context, page, issues };
}

test.describe('Weekly contract + daily vault', () => {
  test('contract strip renders (sign form or live progress)', async ({ browser }, testInfo) => {
    const { context, page, issues } = await openPlanner(browser, ROLE);

    const strip = page.getByTestId('contract-strip');
    const signBox = page.getByTestId('contract-sign');
    const visible =
      (await strip.isVisible().catch(() => false)) || (await signBox.isVisible().catch(() => false));

    await reportIssues(testInfo, page, issues);
    await context.close();
    expect(visible, 'neither the contract progress strip nor the sign form rendered').toBe(true);
  });

  test('signing a contract shows pacing and days left', async ({ browser }, testInfo) => {
    const { context, page, issues } = await openPlanner(browser, ROLE);

    const signBox = page.getByTestId('contract-sign');
    const canSign = await signBox.isVisible().catch(() => false);
    if (!canSign) {
      // Already under an active contract — assert the live strip instead of mutating state.
      await expect(page.getByTestId('contract-strip')).toBeVisible();
      await expect(page.getByText(/left$/)).toBeVisible();
      await context.close();
      test.skip(true, 'active contract already exists — verified the live strip instead');
      return;
    }

    await page.getByRole('button', { name: /serious/i }).click();
    await expect(page.getByTestId('contract-strip')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/ahead|behind/i)).toBeVisible();
    await expect(page.getByText(/\d+d left/)).toBeVisible();

    await reportIssues(testInfo, page, issues);
    await context.close();
  });

  test('vault stays locked until the chain is complete', async ({ browser }) => {
    const { context, page } = await openPlanner(browser, ROLE);

    const vault = page.getByTestId('reward-vault');
    const hasVault = await vault.isVisible().catch(() => false);
    test.skip(!hasVault, 'no chain, so no vault on screen');

    const remaining = await page.getByTestId('mission-card-locked').count()
      + await page.getByTestId('mission-card-active').count();
    const openBtn = page.getByTestId('vault-open');

    if (remaining > 0) {
      await expect(openBtn).toBeDisabled();
      await expect(page.getByText(/poori chain complete karo/i)).toBeVisible();
    } else {
      // Chain complete: the vault must be claimable or already claimed.
      const claimed = (await page.getByText(/reward$/i).count()) > 0;
      if (!claimed) await expect(openBtn).toBeEnabled();
    }

    await context.close();
  });
});
