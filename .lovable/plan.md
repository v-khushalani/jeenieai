# Final Pre-Launch Audit — All 6 Roles

Verified current state: 69,415 questions (53,325 clean / 16,082 still flagged damaged), 503 chapters, 29 badges, 6 test profiles, 1 attempt + 2 test sessions in the DB, 20 feature flags enabled.

## How the audit runs

Scripted Playwright passes against the live preview, logging in with the real test accounts (`Test@1234`), capturing screenshots plus console and network errors on every screen. One pass per role, in this order:

1. **user@jeenie.website (Free)** — signup/login, goal selection, dashboard, Study Now, Practice (30+ questions: repeat check, render check, timer, XP toast), daily 15-question limit + upgrade prompt, AI doubt quota (5/day), test limit, badges, streak, leaderboard, profile, settings.
2. **pro@jeenie.website** — everything above unlocked, AI Planner (mission generate → start → auto-tick live sync), roadmap ladder (grade filter, no duplicate chapters), Test create/attempt/submit/results/history, analytics, PYQ access, doubt solver depth + "bada bhai" tone, roast output.
3. **proplus@jeenie.website** — Pro+ library, virtual lab / simulation launch and interaction, group test + battle end-to-end, rank predictor, higher AI quota.
4. **educator@jeenie.website** — content upload (PDF, animation/simulation, universal grade), approval state, protected viewer + annotation, educator group tests, and confirmation that non-educators are blocked from `/educator`.
5. **admin@jeenie.website** — user management + role change persistence, batches/chapters/topics, bulk CSV template download → fill → upload → review queue, live preview render, subscriptions/plans/promo codes, notifications, feature flags, reports hub, cost panel.
6. **superadmin@jeenie.website** — everything admin plus destructive actions and admin-only routes guarded correctly.

Cross-cutting checks in the same run: mobile viewport (390px) on all main screens, PWA/service-worker freshness, 404 route, SEO head tags and JSON-LD, page-load console errors, RLS spot checks (can a free user read another user's rows?), and edge-function error paths (402/429 surfaced, not swallowed).

## Data-level checks (SQL, read-only)

- Duplicate chapter names/numbers per subject+class across all subjects, not just Physics.
- Subject casing inconsistency (`PHYSICS` vs `Physics`) and its effect on counts.
- Chapters/topics with zero questions (dead ends in the ladder).
- Remaining 16,082 damaged questions: how many are actually reachable in each exam/grade path.
- Orphan rows: attempts/missions pointing at deleted content, profiles without roles.
- Badge criteria vs what the unlock triggers actually award.

## Deliverable

One report split into:

- **Blockers** — breaks a user-visible flow, must fix before release.
- **Should-fix** — works but wrong/confusing.
- **Enhance / cut** — what to add, what to delete because it dilutes the product.

Each item names the exact file, table, or function involved, with the screenshot or log line that proves it. No code changes are made during the audit; fixes come after you pick from the list (or say "fix blockers as you find them" and I will fix + re-verify in the same pass).

## Technical notes

- Playwright scripts live under `/tmp/browser/` only; no project files touched.
- Managed session injection is unavailable for this project, so each role logs in through the real login form.
- The earlier LaTeX repair background worker is no longer running (sandbox reset) — restarting it is part of the fix phase, not the audit.
