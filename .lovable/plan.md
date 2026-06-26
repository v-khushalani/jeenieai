## Current state (what's actually wrong)

`AIStudyPlanner.tsx` is a static, read-only card stack. Problems:

1. **Not actionable** — tasks have no "Start" button, no "Mark done", no progress tracking. User can't *do* anything from the planner.
2. **No real AI** — the `generate-study-plan` edge function (Gemini) exists but the UI never calls it. All "AI" is local heuristics.
3. **Weekly plan is fake** — same topics rotate by index `i % weak.length`. Not adaptive, not time-aware.
4. **Topic fallback missing** — when `topic_mastery.topic` is null/empty, UI shows "Unknown Topic" instead of using the chapter name.
5. **Duplicate UI** — header stats (Days/Accuracy/Streak/Questions) repeat in "Progress Summary". Today's tasks also rendered twice (once full, once as chips inside Weekly card).
6. **Dead intelligence** — `predictRank`, `generateSWOT`, `calculateAdaptiveTarget` exist in `studyPlannerCore.ts` but are never imported by the page.
7. **No persistence** — refresh = fresh random plan. No "yesterday's plan", no streak of plan-following.
8. **Defaults hardcoded** — `DEFAULT_TOPICS` is a tiny 6-item list. New users always see the same 3 generic chapters regardless of their actual goal/grade.

## New layout (single mobile screen, swipeable sections)

```text
┌─────────────────────────────────────────┐
│  AI Study Planner          [↻ Refresh]  │
│  Hinglish 1-liner from Gemini ("Bhai…") │
├─────────────────────────────────────────┤
│ [Days] [Acc%] [🔥Streak] [Plan Adherence%]│ ← 4 compact KPI tiles
├─────────────────────────────────────────┤
│ TABS: Today · This Week · Insights      │
├─────────────────────────────────────────┤
│ TAB 1 — TODAY (default)                 │
│  ┌─Focus banner─────────────────────┐   │
│  │ "Aaj ka mission: 3 weak topics"  │   │
│  │ Progress: ▓▓▓░░░ 1/3 done        │   │
│  └──────────────────────────────────┘   │
│  ┌─Task card (per slot)─────────────┐   │
│  │ 🌅 Morning • 45 min • HIGH       │   │
│  │ Physics → Mechanics → Laws…      │   │
│  │ Accuracy 42% ▓▓░░░░              │   │
│  │ [▶ Start practice] [✓ Done]      │   │
│  └──────────────────────────────────┘   │
│  …afternoon, evening cards…             │
│  ┌─Smart suggestion─────────────────┐   │
│  │ ⚠️ Thermodynamics 9 din se touch │   │
│  │ nahi kiya → [Revise now]         │   │
│  └──────────────────────────────────┘   │
├─────────────────────────────────────────┤
│ TAB 2 — THIS WEEK                       │
│  7-day strip (Sun…Sat) with done/total  │
│  Tap a day → expand its task list       │
│  Mock-test day pill on Saturday         │
├─────────────────────────────────────────┤
│ TAB 3 — INSIGHTS                        │
│  • Rank prediction band ("Top 12%")     │
│  • SWOT grid (2×2, compact)             │
│  • JEEnie's Hinglish strategy note      │
│    (cached from generate-study-plan)    │
└─────────────────────────────────────────┘
```

Swipe left/right between tabs. Whole shell fits one viewport.

## Behavior changes

**Topic fallback:** in `generatePlanFromData`, whenever `t.topic` is empty/null, fall back to `t.chapter`. Display becomes `Subject → Chapter` with chapter doubled as the task title — never "Unknown Topic".

**New-user defaults:** replace the hardcoded 6-item `DEFAULT_TOPICS` with a one-time fetch from the `chapters` table filtered by user's `target_exam` + `grade`. Pick 3 chapters (one per subject) seeded by today's date so it rotates day-to-day. Cache for 24h in localStorage.

**Actionable tasks:**
- "▶ Start practice" routes to `/study-now?subject=…&chapter=…&topic=…` (StudyNowPage already supports filters).
- "✓ Done" writes to a new lightweight `study_plan_progress` table (user_id, date, task_hash, completed_at). Drives the "1/3 done" progress bar and the "Plan Adherence %" KPI (last 7 days).

**Real AI insights (Tab 3):**
- On first load each day, call existing `generate-study-plan` edge function with the user's weak/strong topics. Cache the response in localStorage keyed by `user_id + date` (no repeated billing).
- Render `personalizedGreeting` in the header subtitle, `weaknessStrategy` as the Insights note, `rankPrediction` in the rank band.
- If the function fails/times-out, fall back to the local `predictRank` + `generateSWOT` (already built, just wire them up).

**Smart suggestions:** surface 1 of these per day at most, prioritized:
1. A strong topic with `daysSincePractice >= 7` → "Revise now"
2. A medium topic within 5% of mastery → "Push to 80%"
3. Saturday → "Mock test ready" CTA

**Persistence & streak:**
- "Plan Adherence" = % of today's tasks marked done, averaged over last 7 days from `study_plan_progress`.
- New "🔥 Plan streak" — consecutive days where adherence ≥ 60%.

**De-duplication:** remove the chip rendering of today's tasks from the Weekly card and remove the standalone "Progress Summary" card (its 3 counters move into Insights tab as a small inline row).

## Files touched

- `src/components/AIStudyPlanner.tsx` — full rewrite using the new 3-tab layout.
- `src/lib/studyPlannerCore.ts` — small additions: `getTopicLabel(t)` helper for chapter fallback, expose `predictRank`/`generateSWOT` to component (already exported, just import).
- `src/lib/studyPlannerTypes.ts` — add `completed?: boolean` and `taskId: string` to `DailyTask`.
- `src/hooks/useStudyPlanProgress.ts` *(new)* — read/write completion state.
- `src/pages/AIStudyPlannerPage.tsx` — no change.
- `supabase/migrations/*` *(new)* — `study_plan_progress` table with RLS + GRANTs (user owns own rows).
- `src/services/api/modules/ai.ts` — keep `generateAIInsights` as-is; component will call it directly with daily cache key.

## Out of scope (ask later if you want them)

- Drag-to-reschedule tasks
- Push notification reminders ("Morning task in 10 min")
- Sharing the plan as an image
- Multi-week (30-day) calendar view

---

**Quick confirm before I build:**
1. OK to add `study_plan_progress` table for done/streak tracking? (small, RLS-scoped)
2. OK to call Gemini once per user per day for the Hinglish strategy note (cached)?
3. 3 tabs (Today / Week / Insights) — or do you want everything stacked on one scroll?
