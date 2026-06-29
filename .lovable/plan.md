## Scrap Missions + Reimagine AI Planner as the Hero

**Step 1 — Clean removal** (zero traces, as per your project rule):

- Delete: `TodaysMissionCard.tsx`, `TodaysMissionStrip.tsx`, `MissionPicker.tsx`, `missionEngine.ts`, `useTodaysMission.ts`
- Remove mission strip from `EnhancedDashboard.tsx` and mission progress strip from `PracticePage.tsx`
- Strip `&mission=1` URL handling
- Migration: `DROP TABLE daily_missions CASCADE`, drop RPCs `get_or_create_today_mission` & `reset_today_mission`, drop the auto-advance trigger
- Remove `daily_missions` from realtime publication

Dashboard reverts to clean pre-mission state. No leftover routes, hooks, or DB rows.

---

## AI Planner v2 — "Your Personal JEE/NEET Coach"

The Planner becomes the **single source of daily direction** — replaces what mission was trying to do, but without confusing dual UI. One place, one plan, deep + actionable.

### Core principle
**Today screen = "what to do right now"** · **Week screen = "where am I heading"** · **Insights = "why am I here"**

Currently the 3-tab shell exists but feels static. Yeh raha upgrade:

---

### TAB 1 — TODAY (the daily anchor, replaces mission)

```text
┌───────────────────────────────────────────┐
│ Good evening, Aarav 👋                     │
│ 47 din baad JEE Mains · Day 12 streak 🔥   │
├───────────────────────────────────────────┤
│  📍 Right now: Thermodynamics             │
│  ▓▓▓▓▓░░░░░  5/12 questions done          │
│  Accuracy today 72% · Best chapter: Optics │
│                                            │
│  [ Continue Practice → ]                   │
├───────────────────────────────────────────┤
│  Aaj ka plan (auto-generated)              │
│                                            │
│  ✅  Warmup: 5 quick recall Qs · 5 min     │
│  🔵  Focus: Thermo deep dive · 25 min      │
│  ⚪  Stretch: 3 PYQs from Mechanics · 10m  │
│  ⚪  Cooldown: Review 4 mistakes · 5 min   │
│                                            │
│  ─── total ~45 min · adapts as you go ─── │
├───────────────────────────────────────────┤
│  💡 JEEnie ka note (AI, cached daily):     │
│  "Kal Mechanics 81% — solid. Aaj Thermo   │
│   pe time do, formulas weak lag rahe hain" │
└───────────────────────────────────────────┘
```

**Why this is better than missions:**
- Not 1 mission OR nothing — multiple bite-sized blocks, do as much as you want
- Each block deep-links to existing Practice page with right filters
- Progress auto-updates from `question_attempts` (no separate state to manage)
- No "+50 jackpot" confusion — points come from per-Q practice (existing economy untouched)
- Completion = subtle green checkmark + line cross-out, not a celebration screen

### TAB 2 — WEEK (the rhythm view)

```text
┌─ This week ───────────────────────────────┐
│  M  T  W  T  F  S  S                       │
│  🟢 🟢 🟢 🟡 ⚪ ⚪ ⚪    3/7 active days    │
├───────────────────────────────────────────┤
│  Subject load this week                    │
│  Physics    ████████░░  62%               │
│  Chemistry  ████░░░░░░  28%               │
│  Math       █░░░░░░░░░  10% ⚠ low         │
│                                            │
│  → Plan auto-rebalances tomorrow           │
├───────────────────────────────────────────┤
│  Chapter ladder (this week's focus)        │
│  ✅ Kinematics       100% · 28 Qs          │
│  🔵 Thermodynamics    42% · 12/30 Qs      │
│  ⚪ Wave Optics       Up next             │
│  ⚪ Modern Physics    Next week           │
└───────────────────────────────────────────┘
```

**What's useful:**
- Heatmap = streak motivation without spamming notifications
- Subject load = self-correction signal ("oh I'm avoiding Math")
- Chapter ladder = the linear "Mastery Journey" you wanted, lightweight

### TAB 3 — INSIGHTS (the "why")

```text
┌─ Smart insights (AI-generated daily) ─────┐
│                                            │
│  🎯 Strength: Mechanics (84% avg)          │
│      Last weak spot fixed in 4 days        │
│                                            │
│  ⚠ Watch: Organic Chem reactions           │
│      Accuracy dropped 71% → 58% this week │
│      → Suggested: 10-Q drill today         │
│      [ Start drill ]                       │
│                                            │
│  📈 Exam readiness                         │
│      ▓▓▓▓▓▓░░░░  62% (was 54% last week)  │
│      At this pace: 78% by exam day         │
│                                            │
│  🧠 JEEnie's hot take:                     │
│      "Tu Chem reactions ratta maar raha    │
│       hai — concept revise kar, results    │
│       turant badlenge."                    │
└───────────────────────────────────────────┘
```

---

### Engine logic (deterministic, no AI cost for core)

Daily plan generator (runs once per IST midnight, cached for the day):

```text
1. Pull last 30 days of question_attempts
2. Detect:
   - active chapter (most recent, <30 correct)
   - weak chapter (acc <60%, ≥10 attempts)
   - cold subject (no activity >5 days)
   - exam-weight gaps (high-weight, low-touch)
3. Compose today's 4 blocks:
   - Warmup     = 5 Qs from yesterday's chapter (recall)
   - Focus      = 12-15 Qs from active OR weak chapter
   - Stretch    = 3 PYQs from a stronger chapter (confidence)
   - Cooldown   = 5 Qs review of past mistakes
4. Save plan to study_plan_progress (already exists)
5. As user practices, blocks auto-check-off via trigger
```

AI usage (cheap, ~1 call/user/day via Gemini):
- Today's "JEEnie note" line (1 short sentence, cached)
- Insights tab's "hot take" (1 short paragraph, cached)
- Both regenerate only if user activity changes meaningfully

### Catchy / productive / useful — concrete touches

- **Hindi-mix copy** throughout (matches your AI Doubt Solver tone)
- **Time-of-day awareness** — morning = "Aaj ka plan", evening = "Bas ek aur block puttar"
- **Progress shimmer** when a block auto-completes (subtle, no confetti spam)
- **"Skip today"** button — honest UX, doesn't break streak silently
- **One-tap regenerate** — user can ask "give me a lighter plan" (uses 1 of 2 regenerates/day)
- **Exam countdown** in header — always visible, creates healthy urgency
- **No badges, no points celebrations inside planner** — those live in dashboard/analytics, planner stays focused on doing

### Where the planner sits in the app

- Dashboard top: **single compact card** "Today's Plan · 2/4 done · 25 min left" → tap → full Planner
- Bottom nav already has "Planner" tab — that opens the 3-tab view above
- AI floating button stays — for ad-hoc doubts

---

### Implementation slices

**A. Removal** (1 migration + ~6 file deletes) — fully reversible nothing else
**B. Planner Today tab rebuild** (`AIStudyPlanner.tsx` + new `DailyPlanEngine.ts`)
**C. Week tab — heatmap + subject load + chapter ladder** (read-only from existing tables)
**D. Insights tab — strength/watch/readiness + AI hot-take via Gemini edge fn**
**E. Dashboard compact card** linking into planner
**F. Polish — Hindi-mix copy, time-aware greetings, skip/regenerate, shimmer**

Zero new tables (reuses `study_plan_progress`, `question_attempts`, `chapters`). One existing edge function (`generate-study-plan`) extended for the daily note + hot-take.

### What stays untouched
Badges, leaderboard, AI Doubt Solver, Roast, Analytics, Practice page, points economy, subscription tiers.

---

**Approve karein toh:**
1. Pehle clean removal slice (A) ship karunga — safe, reversible
2. Phir Planner Today tab (B) — biggest UX win
3. Rest incrementally

Ya kuch tweak karna ho — block names, copy tone, layout — pehle batao.
