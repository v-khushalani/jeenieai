# Go-Live: Wipe User Data + Full Audit

Current state (verified): 6 auth users / 6 profiles, 11 role rows, 2 daily missions, 0 attempts, 0 tests, 0 payments. Content is intact: 69,415 questions, 503 chapters, 29 badges.

## Part 1 — Clean wipe of user data

Delete every user-owned row, keep all content (questions, chapters, subjects, topics, batches, badges catalog, plans, feature flags, exam config).

Tables cleared:
profiles, user_roles, user_badges, question_attempts, test_sessions, test_attempt_violations, daily_progress, daily_missions, class_logs, revision_schedule, topic_mastery, study_plans, study_plan_progress, points_log, referrals, promo_redemptions, payments, payment_audit, user_notifications, push_subscriptions, conversion_prompts, ai_request_log, battle_sessions / battle_players / battle_answers / battle_rewards, group_tests, educator_content ownership rows (uploads stay only if you want them — see question below), plus all rows in `auth.users`.

Result: signup counter starts at zero. Existing logged-in browsers auto-logout (the AuthContext guard for deleted accounts is already in place).

Then re-seed the standard test accounts (password `Test@1234`):
user@jeenie.test, pro@jeenie.test, proplus@jeenie.test, educator@jeenie.test, admin@jeenie.test, superadmin@jeenie.test — with correct roles/tiers applied server-side.

## Part 2 — Full Playwright audit (every mode)

Run a scripted end-to-end pass on the live preview, logged in per role, capturing screenshots + console/network errors:

- Free user: signup/login, onboarding + goal selection, dashboard, Study Now, Practice (10+ questions, dedupe check), daily limit gating, upgrade prompts.
- Pro: AI Planner / Coach mission (generate, start, auto-tick), Test mode (create, attempt, submit, results), Test History, Analytics, Badges unlock, Streak, Leaderboard.
- Pro+: Library, AI Doubt Solver, Virtual Lab / simulation launch, group test + battle flow.
- Educator: content upload, simulation launch + annotation, group tests.
- Admin: user management, role change, batches/chapters, Bulk CSV upload + review queue, subscriptions, notifications, feature flags.
- Cross-cutting: mobile viewport pass, PWA/service-worker freshness, 404 route, SEO head tags, page-load console errors.

## Part 3 — Audit report

Deliver one prioritized list: Blockers (must fix before launch), Should-fix, Nice-to-have (add/delete/enhance suggestions), each with the exact file/table involved. No fixes applied in this step without your go-ahead — except trivial blockers, which I'll fix and re-verify in the same pass if you approve that.

## Technical notes

- Wipe runs as one migration: delete child tables first, then profiles, then `auth.users` via admin API in the `seed-test-users` edge function (auth schema can't be truncated from SQL safely).
- Test accounts are created through the existing `seed-test-users` function so roles + subscription tiers are set consistently.
- Playwright scripts live under `/tmp/browser/` only; no project files touched by the audit.
