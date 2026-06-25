## AI Doubt Solver limits — recommendation

Current: Free 3 / Pro 30 / Pro+ 100 per day.

Recommended:


| Tier     | Daily doubts | Monthly soft cap | Per-minute cap | Voice / Image | Why                                                                                                     |
| -------- | ------------ | ---------------- | -------------- | ------------- | ------------------------------------------------------------------------------------------------------- |
| **Free** | **5/day**    | **50/month**     | 1 every 20s    | Text only     | Enough for students to genuinely experience JEEnie before upgrading while keeping AI costs predictable. |
| **Pro**  | **20/day**   | **400/month**    | 1 every 8s     | Image support | Designed for regular daily study with generous usage while preventing abuse.                            |
| **Pro+** | **50/day**   | **1000/month**   | 1 every 4s     | Voice + Image | Built for serious aspirants and heavy revision sessions while maintaining sustainable AI costs.         |


### Anti-abuse safeguards (low-cost, high-impact)

- Reject prompts longer than **800 characters**.
- Keep tier-based output token limits.
- Block identical questions repeated within **60 seconds** using server-side hashing.
- Maintain per-minute rate limiting.
- Track input tokens, output tokens, latency, model and estimated cost for every request.
- Apply a soft monthly quota similar to Lovable AI. Once the monthly quota is exhausted, politely ask the user to wait until the quota resets or upgrade to a higher plan.

### Cost optimization

- Keep **Gemini 2.5 Flash** as the default model for all requests.
- Prompt compression remains the biggest cost-saving optimization.
- Trim conversation history to only the minimum required context.
- Use adaptive response lengths instead of fixed long explanations.
- Keep Gemini Pro integration disabled for now, but design the routing layer so it can be enabled later through configuration if production analytics justify it.

### Estimated AI Cost (after prompt optimization)


| Tier                          | Estimated Cost                  |
| ----------------------------- | ------------------------------- |
| **Free (5/day, 50/month)**    | **~₹0.30–₹0.50 per user/month** |
| **Pro (20/day, 400/month)**   | **~₹5–₹8 per user/month**       |
| **Pro+ (50/day, 1000/month)** | **~₹15–₹30 per user/month**     |


These estimates assume Gemini 2.5 Flash, compressed prompts, adaptive response lengths, and normal educational usage. Actual production analytics should be used to fine-tune quotas after launch.

## 2) "No questions available" when starting tests

Looking at `src/pages/TestPage.tsx` the toast fires from three paths — PYQ (L596), Full Mock (L688), Chapter Test (L821) — all driven by `getTestSeriesQuestions` / `getPracticeQuestions` in `src/utils/batchQueryBuilder.ts`.

The query chain that gates everything:

```text
questions_public view
  → .or(is_active null OR true)
  → .or(exam IN (mapped values) OR exam IS NULL)
  → .in(subject, subjectAliases)
  → .eq(chapter | topic | difficulty)
```

Most likely root causes (in order of probability):

1. `**mapBatchToExamValues()` returns the wrong DB spellings.** `src/constants/examValues.ts` is the single source of truth; if the seeded `questions.exam` rows say `"JEE Mains"` but the mapping returns `["JEE_MAINS","JEE"]`, the `.in()` matches nothing. (This is the same family of mismatch that produced the `JEE_MAINS` display bug earlier.)
2. **Subject alias mismatch** — `getSubjectAliases('Physics')` may not include the casing/spelling actually stored (`"physics"`, `"Phy"`, etc.).
3. `**questions_public` view RLS** — when we recently locked down public access, `anon` GRANT may have been dropped while the student session still uses `authenticated`. If the view's underlying policy uses `auth.uid()` checks that fail for the test student profile, count = 0.
4. **Exam pattern mismatch** — `getExamPattern()` asks for e.g. 75 questions; if fewer than that exist for the batch+subject, the *info* toast fires saying "Only N available" — but if the join above returns 0, it's the *error* toast.

### Fix workflow (build mode)

a. Run a diagnostic SQL: count rows in `questions_public` grouped by `exam` and by `subject` for the failing student's batch.
b. Reconcile `src/constants/examValues.ts` ↔ actual distinct values in `questions.exam`.
c. Reconcile `getSubjectAliases()` ↔ distinct `questions.subject`.
d. Verify GRANT/RLS on `questions_public` for `authenticated`.
e. Add a console.debug log inside `getTestSeriesQuestions` printing the final filter set + result count when 0, so future regressions are visible in 1 click.

## 3) New badges to add

Current showcase already has streaks, "Galat Hi Nahi" (30 in a row), 3-Day Spark, etc. Best additions (Hinglish flavor, mythic→common spread):

**Skill-based**

- *Comeback Kid* — finish a test scoring 80%+ after a previous test < 40%.
- *Speed Demon* — 10 correct answers in under 60s total.
- *Marathoner* — 100 questions solved in a single day.
- *Iron Brain* — 5 consecutive Hard questions correct.
- *Bug-Free Day* — perfect (100%) score on any chapter test.

**Consistency**

- *Morning Person* — 7 sessions started before 8 AM.
- *Night Owl* — 7 sessions after 11 PM.
- *Weekend Warrior* — questions solved both Sat + Sun for 4 weeks.

**Subject mastery**

- *Newton ka Beta* — 95% accuracy on 50 Mechanics questions.
- *Mole Master* — 95% accuracy on 50 Mole Concept questions.
- *Integration Ninja* — Solve 30 Hard Calculus questions.

**Social / engagement**

- *Influencer* — Share 5 result/badge cards.
- *Doubt Slayer* — Use JEEnie AI 20 times in a week.
- *Roast Survivor* — Get roasted 5 times and still come back.

**Mythic / rare**

- *Centurion* — 100-day streak.
- *Topper Mode* — Rank #1 on weekly leaderboard.
- *Perfectionist* — 1000 questions solved at ≥ 90% overall accuracy.

---

**Awaiting your sign-off on:**

- (1) Adopt the desired limit table (mentioned above) + anti-abuse safeguards?
- (2) Proceed with the test-engine diagnostic + fix?
- (3) Implement all ~17 new badges, or pick a shortlist?