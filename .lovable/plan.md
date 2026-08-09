# Brutal Audit + Addiction Plan

## What I actually checked (not opinions)

- 69,415 active questions — **16,082 (23%) still marked `damaged`**.
- 29 badges defined, **0 badges ever awarded** (`user_badges` is empty across all test usage).
- `profiles.daily_xp` / `daily_xp_date` columns exist but **no frontend file reads or writes them**. The "+XP" toasts in Practice are cosmetic strings.
- Battle mode is enabled as a feature flag: **0 battle sessions ever created**. Referrals: 0 rows.
- 2 cron jobs exist. One of them posts to an edge function `reset-streak-freeze` that **does not exist in the codebase** — that job fails every month.
- **There is no scheduled notification job at all.** `send-push-notification` exists but nothing ever calls it on a schedule. Zero re-engagement pings.
- 20 feature flags all ON: battle, group tests, snapshot/wrapped, roast, share card, referral, virtual lab, Pro+ library, planner, analytics.

## The honest verdict

Students won't get addicted, and the reason is not visual polish. It is this:

1. **There is no reason to come back tomorrow.** No reminder, no streak that hurts to lose, no daily reward that resets. The app only works if the student already decided to open it. That is a tool, not a habit.
2. **The reward system is fake.** XP toasts show numbers that are never stored, never displayed anywhere, never accumulate. Badges exist but the unlock engine has awarded nothing. A student notices this within two sessions and stops caring.
3. **You have ~12 features and no core loop.** Battle, group test, virtual lab, wrapped, roast, share card, referral, planner, analytics, Pro+ library. Each is 60% done. A student cannot tell what this app is *for*. Duolingo has one screen and one loop; you have a menu.
4. **23% of questions are visibly broken.** One garbled question destroys more trust than ten good ones build. This alone caps retention.
5. **The leaderboard is global and meaningless.** Competing with 10,000 strangers you will never beat is demotivating, not addictive.

## The plan — build one loop, cut the rest

### Phase 1: Make the loop real (this is the whole product)

**1. Real XP, visible everywhere**
- Write `daily_xp` on every attempt (all modes except test), reset at midnight IST.
- Persistent XP ring in the header: `120 / 200 XP today`. Fills live as you answer. This replaces the "1/15 goal" text nobody reads.
- Correct = +10 XP, streak bonus, first-try bonus. Wrong = 0 but never negative.

**2. Streak that hurts to lose**
- Streak counter in the header at all times, with the flame going grey after 20:00 if today's XP goal isn't met.
- Streak freeze: earnable, spendable (and delete the broken cron job or ship the missing function).
- On breaking a streak: one "repair streak" offer — solve 10 questions today to restore it. This is the single highest-retention mechanic in every app that has it.

**3. Evening reminder push (the missing piece)**
- Daily cron at 19:30 IST → push to anyone whose XP goal isn't met: "Aaj ka goal adhoora hai. 6 questions aur — streak bachaale."
- 21:30 last-call push only for users with an active streak ≥3.
- Without this, everything else in this plan is worth roughly nothing.

**4. Weekly League (replaces global leaderboard)**
- Groups of 20-30 students of similar activity, ranked by weekly XP. Sunday midnight: top 5 promote, bottom 5 demote. Tiers: Bronze → Silver → Gold → Diamond.
- Beating 25 real peers is addictive. Rank #4,812 globally is not.
- Keep the global list as a secondary tab only.

**5. Fix the trust problem**
- Hide all `text_quality = 'damaged'` questions from every student-facing path immediately (16k questions is affordable to lose out of 69k).
- Resume the LaTeX repair worker in the background and un-hide as rows pass verification.
- Add a one-tap "yeh question toota hua hai" button on every question, feeding the admin reports hub.

### Phase 2: Make sessions feel good

- **Combo meter in Practice**: 3, 5, 10 in a row → escalating bonus XP and a visible multiplier. Breaking the combo should sting a little.
- **60-second Speed Round**: one tap from the dashboard, 10 rapid questions, XP burst. This is the "I have 2 minutes" entry point that a chapter-selection flow can never be.
- **Session close screen**: XP earned, accuracy, combo best, league position change, streak. Then one button: "Kal phir aana hai" or "Ek aur round".
- **Fire the badge engine properly**: verify awards actually land, and surface them in the close screen instead of a separate page nobody visits.

### Phase 3: Cut ruthlessly (this is the part you won't like)

Turn OFF at launch, keep the code:

- **Battle mode** — zero usage, needs two live students at the same second; you don't have the user base yet.
- **Virtual lab / Educator games** — empty shells behind Coming Soon banners; they make the app look unfinished.
- **Wrapped / Snapshot** — a year-in-review feature for an app with no year of data.
- **Group tests** — overlaps with League; revisit after 1,000 users.
- **Roast** — keep, but move it into the session close screen instead of a separate destination.

Ship with: Dashboard (XP + streak + league + Speed Round), Study Now, Practice, Tests, AI Planner (Pro), JEEnie doubt solver, Badges inside the close screen. That's it. Seven things done fully beats twelve done partially.

### Phase 4: The AI Planner question

You have been unsure about the planner for weeks — that's the signal. In its current form it is a second to-do list competing with the streak/XP loop.

Reduce it to one thing: **"Aaj kya karna hai"** — three tasks, auto-ticked by real attempts, each worth XP that feeds the same daily goal. No roadmap ladder on the same screen, no reasoning paragraphs, no separate progress model. The ladder moves to its own tab for the students who want the full syllabus map.

## Technical notes

- XP: new `award_xp` RPC called from the existing attempt-recording path; daily reset by comparing `daily_xp_date` to IST date; header component subscribes to profile changes.
- Leagues: new `leagues` + `league_members` tables (weekly cycle, tier enum), a Sunday cron to promote/demote and open the next cycle, GRANTs plus RLS so members read only their own league.
- Reminders: pg_cron at 19:30/21:30 IST → edge function that queries under-goal users with push subscriptions and calls the existing `send-push-notification` path.
- Damaged questions: filter inside `fetch_unseen_questions` and the count RPCs so hidden rows also drop out of chapter counts (otherwise "Coming Soon" logic breaks again).
- Broken cron: either ship `reset-streak-freeze` or delete the job — right now it errors silently every month.
- Feature cuts are flag flips in `feature_flags`, plus route guards so a typed URL doesn't reach a disabled screen.

## What I need from you

Say the word and I start with Phase 1 in order: XP → streak → evening push → league → damaged-question hide. Phase 1 is the part that decides whether students come back. Everything after it is polish.
