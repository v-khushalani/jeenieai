# Launch Plan — Planner 5.0, Rewards, Play Store, and a brutally honest founder read

## Part A — What is actually broken today (verified, not guessed)

1. **Challenge opens, then "questions nahi hain".** Today's mission rows deep-link like `/practice?mode=chapter&subject=Mathematics&difficulty=easy&target=8` — no chapter, no topic. The one block that does target a topic points at a topic that has **3 questions total** while asking for 8. So the block is unwinnable by construction. Verified from `daily_missions` rows for pro and pro-plus.
2. **Topic names are missing.** The mission generator enriches weak topics with a query that selects a `subject` column from `topics` — that column does not exist. The lookup fails silently, so blocks lose their `chapter_id` and the title renders as "Weak-fix — this topic". This is the same root cause as (1): blocks fall back to subject-only links.
3. **Rewards page is dead.** `/rewards` reads `reward_store_items`, `reward_claims`, `draw_entries`. None of these tables exist in the database — only `reward_vault_claims` does. The SQL for them was left in `supabase/manual/` and never run.
4. **Planner is text-heavy and off-brand.** Coach lines like "Sochna mat, main bata deta hoon", "Aaj ka plan", "Aaj pending", plus Hindi/Hinglish tab labels ("Aaj", "Inaam") and inconsistent tile spacing.
5. **Play Store: nothing is ready.** No `android/` project, and `capacitor.config.ts` points the app at a placeholder remote URL (`...project.com`) instead of bundling `dist`. Shipping that config to Play Store would be rejected and would break the app offline.

## Part B — Planner 5.0 (minimal, interactive, English-first)

Same bento structure, far less text.

- **Copy purge:** remove the coach monologue, "Aaj ka plan / Aaj pending" strip, "why/what" paragraphs on cards. Each tile gets one number and one word. Card = chapter name, question count, one button.
- **Tabs:** `Today · Journey · Rewards` (English, pill segmented control, equal widths, consistent 12px gutters, sticky under header). No emoji, no Hindi labels.
- **Hero tile:** big progress ring, "3 of 5 done", one primary button (`Start` / `Continue`), live tick when questions get solved.
- **Stat tiles:** Streak, Points, Combo — number-first, label in small caps, subtle spring on change.
- **Interaction:** tap a tile to expand in place instead of navigating away; completed steps collapse into a thin done-strip.

### The real fix behind the challenge cards

The generator must only emit a block it can actually fill:

- Repair the topic lookup (correct columns, subject via the chapter join) so blocks carry `chapter_id`, `topic_id`, and a real title.
- Before a block is written, ask the database how many **unseen, active, exam- and class-matched** questions exist for that scope. If the count is below the block's target, shrink the target; if it is below a floor, drop that scope and pick the next-best chapter.
- Never emit a subject-only fallback link. If the generator cannot find a valid chapter, it emits a revision or mock block instead.
- Practice page: if a mission block still lands empty, auto-widen to the parent chapter and tell the user what changed instead of a dead end.

## Part C — Rewards page (real, with placeholders you can fill)

- Create the missing tables (store items, claims, draw entries) with grants and RLS, plus a small admin screen so you add prizes without touching code.
- Each prize placeholder holds: image, name, MRP, units available, points cost or streak requirement, active toggle.
- **Podium/ladder layout:** a 3-step podium for the top prizes (e.g. laptop / tablet / earbuds) with MRP and "X units left" chips, then a rising staircase of streak milestones (7 / 30 / 100 / 365 days) with locked-glow states, then the points store grid below.
- Seeded with clearly-marked placeholder prizes so the page looks alive on day one; you swap the real gifts from admin.

## Part D — Play Store readiness (plain-language)

What has to happen before your app can be listed:

1. Point the app at the bundled build instead of a remote placeholder URL, add the Android project, app icons, splash screen, and a real package name.
2. Version code and version name, plus a signing key (I will prepare everything; you generate/store the key once — it can never be lost or the app can't be updated).
3. Store listing assets: title, short and long description, 2–8 phone screenshots, 512px icon, 1024x500 feature graphic, category, contact email.
4. Policy pages that Play checks: privacy policy URL, account deletion path (Play now requires an in-app and web way to delete your account), and data-safety answers.
5. Payments: Play requires their billing for digital goods. Selling subscriptions through Razorpay inside the Android app risks removal. Safest launch: ship the Android app **without** in-app purchase UI, keep subscriptions on the website.
6. Then: internal testing track → closed test with your students → production rollout. First review typically takes a few days.

I will do 1–4 and hand you a checklist for the parts only a human account owner can do (developer account, signing key, screenshots approval, store form).

## Part E — Founder-level read (no sugar)

**Product.** The core loop is fine; the execution is noisy. Too much personality text, too many half-wired surfaces (rewards, contracts, vault) that a student hits and finds empty. Empty surfaces destroy trust faster than missing features. Rule for launch: every visible thing either works or is not visible.

**The biggest risk is not design, it's content trust.** Questions with render damage and thin topics (a topic with 3 questions) are why the planner breaks. Before launch: audit question counts per chapter for the grades you actually serve, hide chapters below a minimum, and keep the repair pass running.

**Monetisation.** Free tier must be genuinely useful but capped by daily volume, not by locking the planner outright — the planner is the habit, and you cannot charge for a habit nobody formed. Convert on analytics, mock tests, unlimited doubts, and rewards eligibility.

**Marketing.** Your differentiator is not "AI". Every competitor claims AI. Yours is "you never decide what to study, and you can see it working". Lead with proof: shareable daily streak/mission cards, weekly progress recaps, a public leaderboard per school/coaching. Seed with one coaching batch, not the open internet.

**Rewards economics.** A 365-day laptop giveaway only works with unit caps and a verified-activity requirement. Keep the grand prize scarce and the weekly wins frequent — small, certain rewards drive retention; big, unlikely ones drive signups.

**Honest verdict on launching today:** the app is launchable on the web today once A1–A3 are fixed. The Play Store build is not a today item — plan a few days for the Android project, assets, and review.

## Execution order

1. Fix the mission generator (question-availability check + topic lookup) and the practice fallback.
2. Planner 5.0 copy purge, tab bar, spacing, tile interactions.
3. Rewards tables + admin placeholder management + podium/staircase page.
4. Sweep every route for empty/dead surfaces; hide or wire.
5. Android project, icons, config, account-deletion route, data-safety and store checklist.
6. Full E2E pass across all six test accounts, mobile and desktop, then go live on web.

## Technical notes

- `supabase/functions/generate-daily-mission/index.ts`: fix the `topics` select, add an unseen-count probe (new security-definer function reusing the `fetch_unseen_questions` scoping) before pushing each block, adaptive target sizing, remove subject-only hrefs.
- `src/components/AIStudyPlanner.tsx`, `src/components/planner/BentoBoard.tsx`, `MissionCard.tsx`, `JeenieCoachLine.tsx`: copy reduction, English tabs, spacing tokens; retire the coach line.
- New migration: `reward_store_items`, `reward_claims`, `draw_entries` with GRANTs + RLS; admin CRUD under the existing admin dashboard.
- `src/pages/RewardsPage.tsx`: podium + staircase + store grid against the real tables.
- `capacitor.config.ts`: drop the remote `server.url`, set a real `appId`; add `android/` via Capacitor, icons and splash from the existing logo; add an in-app account deletion screen.
