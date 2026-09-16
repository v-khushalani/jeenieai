# JEEnie vs JEEGenie — Brutally Honest Audit + Domination Plan

Checked jeegenie.com live today (home, pricing, FAQ) and measured our own database and feature set.

## What they actually are

A narrow, extremely well-executed JEE-only product. Their whole story is one line: **"Don't just practice. Understand it."** Genie asks you a question, you answer, it adapts — Socratic, step by step. Claims: 74,000+ questions, real papers 1978–2026, 50,000+ pre-built Socratic walkthroughs, one honest readiness score / rank prediction, 49 chapters with a 2-minute "crux" + animations, adaptive CAT engine, free JEE rank/percentile/college predictor tools for SEO.

Pricing: 7-day full Pro free, no card, then a real free tier forever. ₹2,499 until exam, ₹4,500 for 2 years, ₹899 focused plans (one subject / past papers / tests only). One-time payments, no auto-renewal.

## Where we actually stand (measured, not guessed)

- 69,415 questions, 53,318 active, 503 chapters but **only 147 chapters have any active questions**.
- Chemistry 19,223 · Biology 16,689 · Physics 11,293 · **Maths only 6,113**.
- 12,072 marked PYQ, years 2002–2024 only, 23 distinct years.
- 100% have an explanation field; **0 questions are marked verified**.
- We cover JEE + NEET + Foundation 6–10 + educator portal. They cover JEE only.

## Ratings out of 10

| Feature | Us | Them | Honest note |
|---|---|---|---|
| Positioning / one-line story | 3 | 9 | They own "understand it". We say "AI study partner" — forgettable. |
| Landing page + conversion | 4 | 9 | Their page *demonstrates* the product; ours describes it. |
| Question bank size | 7 | 8 | Comparable, but our Maths is thin and 356 chapters are empty. |
| Content trust / verification | 2 | 8 | Zero verified flag, past render damage. They claim keys verified vs real papers. |
| PYQ depth | 4 | 9 | 2002–2024 vs their 1978–2026, and no session/shift tagging. |
| Step-by-step teaching | 4 | 10 | We give an answer + explanation. They make the student derive it. This is the gap. |
| AI doubt solver | 6 | 8 | Ours is good and Hinglish, but reactive; theirs is proactive and Socratic. |
| Study planner | 5 | 7 | We rebuilt it 5 times; it is still ours to prove. Theirs is one daily action. |
| Adaptive difficulty | 3 | 9 | We have mastery levels, no real CAT/IRT engine. |
| Analytics + rank prediction | 4 | 9 | We hid percentile because it looked fake. They lead with honest rank. |
| Chapter learning content | 2 | 8 | We have no theory/crux layer at all. Practice only. |
| Gamification / retention | 8 | 3 | Badges, streaks, combos, rewards, roast. Real edge. |
| Social / group / battle | 8 | 1 | Group tests, leaderboard, 1v1, community. They have nothing. |
| Educator portal | 8 | 0 | Simulations, PPTs, group tests. Zero competition. |
| Multi-exam (NEET + 6–10) | 8 | 2 | Our NEET bank is our biggest single asset — bigger than our JEE bank. |
| Mobile / app | 6 | 5 | We have PWA + Capacitor. Play Store not shipped. |
| Free-tier generosity | 4 | 9 | 15 q/day feels stingy; their 7-day full Pro + forever-free converts better. |
| Pricing clarity | 5 | 9 | Their ₹899 focused plans and no-EMI promise are sharp. |
| SEO / free tools | 2 | 9 | They have rank/percentile/college predictors pulling free traffic. |
| **Overall** | **4.8** | **7.6** | We are broader. They are sharper. Sharp wins in a first impression. |

## The brutal summary

They beat us on the only two things a first-time student judges: **the landing page makes them feel smarter in 30 seconds**, and **the product teaches instead of testing**. We beat them on everything that keeps a student for 6 months: social, gamification, teachers, NEET, and Foundation classes. Right now we lose the fight before the student ever sees our strengths.

Also: a competitor named JEEGenie against our JEEnie is a real brand-collision risk. Being the one with NEET + classes 6–10 + teachers is our separation.

## How we go dominant

### Phase 1 — Match their killer move (highest priority)
1. **Guided Solve mode.** Every question gets an optional "Samjha de" path: JEEnie breaks it into 3–4 micro-choices the student answers, builds the working line by line, and adapts on the wrong pick. Generated on demand by the AI, then cached to the question so it becomes a permanent asset. This directly neutralises their 50,000 walkthroughs.
2. **Landing page that demos itself.** Replace the current hero with a live, playable Guided Solve on the homepage — no signup. Plus one honest number strip.
3. **Free tier rework.** 7 days of full Pro on signup, no card, then a real forever-free tier. Kill the 15-question wall as the first impression.

### Phase 2 — Trust and depth
4. **Verification pass.** Run every active question through an AI key-and-render check, stamp `is_verified`, and show a verified badge. Zero verified today is indefensible.
5. **Fill the holes.** Maths bank up to parity, backfill PYQ to 1978 with session/shift tags, and hide or fill the 356 empty chapters.
6. **Chapter Crux.** A 2-minute AI crux + formula sheet + one simulation per chapter, reusing the educator simulation library we already built.
7. **Honest Readiness Score.** Bring percentile back, but as a defensible, explained rank band with the formula shown. Honesty as a feature.

### Phase 3 — Win on what they can never copy
8. **Ship the NEET story properly.** Our NEET bank is larger than our JEE bank. JEEGenie cannot follow us there. Separate NEET landing page and positioning.
9. **Teacher distribution loop.** One teacher = 30–150 students. Class code, class dashboard, free Pro when 20 students join.
10. **Group test viral loop + battle.** Shareable result cards, class leaderboards, 1v1 duels.
11. **Free SEO tools.** JEE + NEET rank predictor, marks-vs-percentile, college predictor. They are winning free search traffic we are not even competing for.
12. **Pricing rework.** Add a ₹899-style focused plan (one subject / PYQ only / tests only) and state plainly: one-time, no auto-renew, no EMI, no sales calls.

## Suggested order

Phase 1 first and alone — Guided Solve, the new landing page, and the free-tier change. That closes the entire perception gap. Phase 2 makes us defensible. Phase 3 makes us unbeatable.

## Technical notes

- Guided Solve: new `question_walkthroughs` table (question_id, steps jsonb, model, verified), generated by a new edge function via the AI gateway, cached on first request, rendered in Practice/Test-review and in the Doubt Solver. Reuses existing KaTeX rendering.
- Verification: batch edge function writing `is_verified` + `text_quality`, surfaced in the existing admin Question Health console.
- Readiness score: derived from attempt accuracy, difficulty weight and pace, stored per user, displayed with its inputs.
- Free-tier change touches `FREE_LIMITS`, `userLimitsService`, and a trial window on the profile.
- SEO tools: static public routes with JSON-LD, no auth.
