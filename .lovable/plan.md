# Switch test accounts to @jeenie.website + post-launch enhancements

## 1. Rebuild test accounts on @jeenie.website

Delete every existing `@jeenie.test` account (auth user + profile + roles + all owned progress rows), then recreate the same six roles on the real domain with the same easy password.

New accounts (password `Test@1234` for all):

| Role | Email |
|---|---|
| Free student | user@jeenie.website |
| Pro | pro@jeenie.website |
| Pro+ | proplus@jeenie.website |
| Educator (pre-approved) | educator@jeenie.website |
| Admin | admin@jeenie.website |
| Super admin | super@jeenie.website |

Technical steps:
- Update `SPECS` in `supabase/functions/seed-test-users/index.ts` to the `.website` domain and add an explicit cleanup pass that deletes any leftover `@jeenie.test` auth users before seeding.
- Educator seed sets `educator_approved = true` so no manual approval is needed.
- Pro/Pro+ get active subscriptions to all active batches, `daily_question_limit` raised, onboarding marked complete.
- Run the function, then verify with a database read: 6 users, correct role per user, correct tier per profile, 0 `@jeenie.test` rows.
- Playwright login check for each of the six accounts, confirming the landing surface each role should see (dashboard, planner for Pro/Pro+, `/educator`, `/admin`).

Note: `@jeenie.website` is your live domain. These are dummy mailboxes used only for password login (email confirmation is force-set), so no real inbox is required.

## 2. Suggested next enhancements

Ordered by impact for launch:

1. **Fix garbled question text** — the audit found mojibake ("cos â¡ ρ t²") in imported questions. Run a one-time encoding-repair pass over the `questions` table and report how many rows were affected.
2. **Mock test exam filter** — the mock generator still uses exact exam-name matching, so JEE students can get NEET-style questions. Reuse the exam-family logic already added to `fetch_unseen_questions`.
3. **Empty-state polish** — Analytics, Badges and Planner look dead for a brand-new user. Add "solve 5 questions to unlock" style prompts instead of blank cards.
4. **Free-tier limit visibility** — show remaining daily questions and an upgrade nudge when the free limit is close, so the paywall converts instead of frustrating.
5. **Real-user safety before launch** — disable/rotate the QA seed function's setup token once testing is done, so it can't be triggered in production.
6. **Basic monitoring** — surface signup, first-practice and payment-success counts on the admin dashboard so you can see day-one traction without querying the database.

I will do item 1 of section 2 only if you ask; this plan's build scope is section 1.
