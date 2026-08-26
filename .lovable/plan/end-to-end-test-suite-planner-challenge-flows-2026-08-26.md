# End-to-End Test Suite: Planner + Challenge Flows

Playwright is already installed and `npm run e2e` scripts exist, but there is no config and no test folder. This adds a real, runnable suite that logs in as each seeded account and walks every planner and challenge flow, reporting failures (including broken links and dead ends) in one HTML/list report.

## What the suite covers

**Accounts tested** (seeded via the existing test-user function, shared password from an env var):
free user, pro, pro+, educator, admin, super admin.

**Per-account journey**
1. Login → lands on dashboard (no console errors, no redirect loop).
2. Navigate every nav/menu link visible to that role; assert no 404 page, no blank screen, no error boundary.
3. Role gates behave: free user is blocked from `/ai-planner` with an upgrade prompt; non-educator is blocked from `/educator`; non-admin is blocked from `/admin`.

**Planner + Challenge flows (pro / pro+)**
- `/ai-planner` opens on "Aaj ke Challenges"; the chain renders 3–5 challenges.
- First-run setup dialog: pick prep mode + daily minutes → chain generates.
- Exactly one challenge is active; the rest render locked; done ones render ticked.
- "Challenge accept" deep-links to a working practice/test route that actually loads questions (this is the classic dead end — a chapter with zero questions).
- Contract strip: sign a contract → progress, pacing and days-left render.
- Reward Vault stays locked while the chain is incomplete and reports the correct message when force-clicked.
- Mastery Ladder tab: chapters render, no duplicate chapter names, node click leads somewhere valid.
- Refresh/regenerate chain button works and does not wipe progress.

**Cross-cutting**
- Mobile viewport (390px) pass over the planner screens.
- Unknown route renders the 404 page (not a crash).
- Every failure is captured with a screenshot, the final URL, and console/network errors.

## Deliverable

`npm run e2e` prints a per-account pass/fail table and writes an HTML report. Any broken link or dead end shows up as a named failing test, so fixes can be scoped precisely afterwards.

## Technical details

- `playwright.config.ts` at the project root: `baseURL` from `E2E_BASE_URL` (defaults to `http://localhost:8080`), `webServer` running `npm run dev` when the port is free, chromium project + a mobile-viewport project, retries 1, HTML + list reporters, screenshots and traces on failure.
- `e2e/` folder (already excluded by `vitest.config.ts`, so unit tests stay untouched):
  - `fixtures/auth.ts` — `loginAs(page, role)` helper plus a `storageState` cache per role so each spec reuses the session instead of logging in repeatedly.
  - `fixtures/accounts.ts` — role → email map; password read from `E2E_PASSWORD` (falls back to the known test password) so no credential is committed as a secret-looking literal.
  - `fixtures/console.ts` — attaches console/pageerror/failed-request listeners and fails the test on uncaught errors.
  - `specs/routes.spec.ts` — role-aware link crawl and gate assertions.
  - `specs/planner-chain.spec.ts` — challenge chain, setup dialog, lock/active/done states, deep-link target loads questions.
  - `specs/contract-vault.spec.ts` — contract signing, pacing display, vault lock behaviour.
  - `specs/ladder.spec.ts` — mastery ladder rendering and duplicate-chapter check.
  - `specs/smoke-mobile.spec.ts` — 390px pass.
- Selectors: prefer roles and visible text already in the components; where a flow has no stable handle (chain cards, contract strip, vault), add `data-testid` attributes to `MissionChain.tsx`, `MissionCard.tsx`, `RewardVault.tsx`, and `ContractStrip.tsx`. No behaviour changes to those components.
- Tests are read-mostly, but the planner flow does write (sign contract, generate chain). They run only against the seeded test accounts, and the contract spec skips itself if an active contract already exists rather than mutating live state.
- `package.json`: keep `e2e` scripts, add `e2e:headed`. No new dependencies.
