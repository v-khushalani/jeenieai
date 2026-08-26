# JEEnie Growth OS — production rebuild plan

## Product decision

Build one combined system rather than choosing between learning quality and engagement:

**Adaptive Mission OS = spaced repetition + mastery path + challenge game + verified social proof.**

The student opens JEEnie because the next win is obvious, improves because every task is selected from real performance data, and shares because the result gives genuine status.

```text
Attempt data
   ↓
Mastery + forgetting engine
   ↓
One clear daily mission chain
   ↓
Visible skill/rank improvement
   ↓
Shareable proof + friend challenge
   ↓
Friend joins → both study → new proof
```

North-star metric: **mastered topics retained per active student per week**. DAU, streaks, shares, referrals, and time spent remain supporting metrics—not substitutes for learning.

## 1. Rebuild JEEnie AI on a reliable Gemini path

The deployed logs confirm two failures: the Gateway hostname is malformed and the direct fallback uses retired `gemini-1.5-flash`. Failed requests currently fall back to jokes while still consuming usage.

- Replace the hand-written provider calls with one server-only Lovable AI Gateway helper using the supported default `google/gemini-3.7-flash`.
- Use the documented Gemini chat path, Gateway authentication header, run-ID propagation, and streaming for potentially long answers.
- Keep authentication, daily/monthly limits, deduplication, Hinglish teaching style, image questions, and output sanitization.
- Remove the direct Google API fallback, stale Gemini 1.5 references, dead OpenAI stubs, hidden humor-success response, and timeout-based aborts.
- Return specific user-visible errors. Retry only `429`/`5xx` with bounded backoff; never retry `400/401/402/403`.
- Count usage only after a real model response succeeds.
- Move every remaining Gateway caller onto the shared helper: doubt solver, roast, study-plan generation, PDF extraction, question repair, and dataset importer.
- Deploy affected Edge Functions and prove the exact live path with authenticated text, maths/LaTeX, image, roast, quota, and provider-error tests.

## 2. Planner USP: Adaptive Mission OS

### Learning engine
- Make spaced retrieval the core scheduler: every topic gets mastery, last attempt, next due date, lapse count, difficulty, exam weightage, and prerequisite readiness.
- Daily priority = **overdue risk × weakness × exam importance × prerequisite value**, constrained by available study time.
- Wrong answers shorten the review interval and trigger a small concept-repair mission; repeated correct retrievals expand the interval.
- Use interleaving: today's chain mixes one due review, one weak-topic repair, one syllabus-progress task, and an optional timed challenge.
- Build syllabus completion as a visible end-to-end route, filtered strictly by exam and class. No chapter is silently skipped.
- Keep deterministic academic decisions auditable; use AI for explanations, plan summaries, and encouragement—not for inventing mastery data.

### Daily experience
- One active mission at a time with one CTA; next mission unlocks automatically from real attempts.
- Three layers only: **Today**, **Syllabus Journey**, and **Growth Report**. Remove duplicate planner views and excess explanatory text.
- Continue using JEEnie Points only. Rename internal `xp_reward` fields to points terminology so no second currency leaks into UI or APIs.
- Replace random vault/loot behavior with earned, predictable milestones: review cleared, weak topic repaired, chapter mastered, personal best, and weekly contract completed.
- Add recovery mode after a missed day—never shame, reset progress, or manufacture urgency.

### Growth feedback
- Show meaningful deltas: “Electrostatics retention 52% → 74%”, “3 weak concepts repaired”, “12-day syllabus lead”, and “personal best accuracy”.
- Separate effort wins from mastery wins so students can celebrate consistency without gaming question volume.
- Weekly plan adapts from outcomes automatically; students can inspect “Why this mission?” in one short line.

## 3. Viral growth system — make real progress brag-worthy

The project already has share cards, Wrapped, badges, referrals, leaderboard data, and QR links. Unify them into a measurable growth loop instead of adding disconnected features.

### A. Progress Receipts — highest priority
Auto-create premium, privacy-safe share cards after verified milestones:
- Topic transformation: “42% → 81% in Rotational Motion”
- Comeback: “Fixed 7 past mistakes without hints”
- Retention proof: “Remembered this chapter after 30 days”
- Personal best: speed, accuracy, or streak with a minimum quality threshold
- Syllabus checkpoint: 25%, 50%, 75%, 100%

Each card contains a deep-linked challenge and referral attribution, but no email, school, exact weak-topic history, or unverified rank claim.

### B. Challenge-a-friend loop
- Every strong result can become a reproducible challenge: same topic, question count, and difficulty—not the same question IDs.
- Friend opens a public preview, signs in, attempts it, and both receive a result comparison based on accuracy plus time.
- Rewards unlock only after the invited student completes meaningful practice, preventing referral spam.
- Add private rematch and small study-squad links; public leaderboards remain opt-in and use aliases.

### C. Weekly JEEnie Report
- Turn the existing Wrapped experience into an automatic weekly story: growth, mastered topics, comeback moment, consistency, and next target.
- Make vertical story (1080×1920), square post, and WhatsApp-friendly compact formats.
- Generate a distinct “identity title” from verified behavior—such as Consistency Machine or Comeback Specialist—without fake rarity.

### D. Status that reflects learning
- Badge rarity must come from difficult verified requirements, not random rewards.
- Add mastery streaks and subject belts based on retained knowledge, not app opens.
- Create an optional public academic profile with earned badges, current syllabus progress, challenge history, and shareable URL.
- Add cohort/friend leaderboards for weekly growth delta and missions completed; avoid absolute-rank humiliation and pay-to-win boosts.

### E. Free acquisition outside the app
- SEO utility pages: free chapter diagnostics, exam-weightage explorers, formula/revision checklists, and “test your readiness” tools that lead into a personalized mission.
- Student-generated challenge pages become indexable only when content is safe, useful, and non-personal.
- Campus/classroom ambassador kits: unique squad link, printable QR challenge, cohort dashboard, and rewards based on activated learners—not raw signups.
- Creator/teacher loop: educators publish a challenge pack; students share results; the pack links back to the educator and JEEnie.
- Referral ladder: cosmetic/profile recognition and limited Pro trials for qualified activations; never cash-like rewards for spam.

### Measurement and safeguards
Track impression → share intent → native share/download → link open → signup → first mission → 7-day retained learner. Measure viral coefficient and learning uplift together.

Guardrails:
- Opt-in sharing, anonymous by default, delete/revoke controls, minor-safe profiles.
- Server-verified achievements and challenge results.
- No loot boxes, fake countdowns, streak-loss threats, fabricated percentile, forced contacts access, or pay-to-win ranking.
- A growth experiment ships only if learning outcomes stay neutral or improve.

## 4. Fix educator simulations end to end

The three live simulations are private uploaded files (one compiled JSX module and two HTML documents), so the exact uploaded assets—not only external embeds—must be reproduced.

- Run all three live files through the educator flow and capture iframe console, CSP, module import, signed-URL, and runtime failures.
- Harden the upload compiler for supported self-contained React files; reject unsupported imports with a precise pre-upload error.
- Validate the compiled module before saving it and add a visible admin preview before approval.
- Make HTML and compiled-script execution use one explicit source contract with correct MIME type, base URL, sandbox, and signed-URL refresh.
- Add runtime error forwarding from the simulation iframe to the parent viewer and replace indefinite loading with a clear retry/error state.
- For external embeds, allow only curated HTTPS providers, align CSP to that allow-list, and reject providers that block framing.
- Verify launch, interaction, resize, fullscreen, close/reopen, and signed-link expiry on desktop and mobile for every live simulation.

## 5. Production verification

- Add unit tests for Gateway error mapping, planner scheduling/interval updates, share eligibility, simulation transpilation, and URL validation.
- Add authenticated Playwright flows for Free, Pro, Pro+, educator, admin, and super-admin roles.
- Verify JEEnie text/image/roast responses; mission generation and instant auto-tick; due reviews; challenge shares/referrals; all three simulations; mobile layouts; and no dead ends.
- Run a production build, deploy Edge Functions, perform real Gateway calls, inspect logs, and report pass/fail evidence before calling the release ready.

## Delivery order

1. **Stability:** JEEnie AI and all uploaded simulations working with live verification.
2. **Academic core:** spaced-repetition/mastery scheduler and clean mission chain.
3. **Growth proof:** progress receipts, weekly report, and verified share analytics.
4. **Network loops:** friend challenges, squads, educator packs, public opt-in profiles.
5. **Optimization:** experiments ranked by retained mastery uplift and qualified viral conversion.
