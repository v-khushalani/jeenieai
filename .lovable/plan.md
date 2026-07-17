# Planner v2 — "Aaj ki Hit-List" (auto-tick to-do)

## Part A: Hide percentile (quick)

Har jagah se percentile number/UI hata do jab tak Option B (real peer data) ready nahi. Rank/percentile ki jagah **streak + XP + today's progress** dikhega.

**Files touched:**
- `src/components/planner/CoachMissionPanel.tsx` — sticky header se percentile chip remove
- `src/components/AIStudyPlanner.tsx` — rank prediction card hide
- `src/pages/EnhancedDashboard.tsx` — percentile widget hide
- `supabase/functions/compute-coach-signal/index.ts` — response me `percentile` field bhejna band (backward-safe, sirf frontend consume nahi karega)

Percentile logic delete NAHI karenge — sirf UI hidden. Baad me Option B ke liye code available rahega.

---

## Part B: Planner redesign — "Hit-List" model

### Mental model (ek line me)

**"Aaj ye 5 cheezein karni hain. Har cheez jaise-jaise complete hoti hai, khud tick lag jaata hai. Jaise Todoist + Duolingo ka bachcha."**

Complex mission blocks, Kya/Kyun/Goal collapsibles, weekly reports — sab gone. Ek clean list. Bas.

### Screen anatomy

```text
┌─────────────────────────────────────────────┐
│  Good morning, Aarav 👋                     │
│  🔥 12 day streak · ⚡ 340 XP today         │
├─────────────────────────────────────────────┤
│  AAJ KI HIT-LIST                    3 / 5   │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 60% │
├─────────────────────────────────────────────┤
│  ☑  Thermodynamics · 10 Q          +40 XP   │  ← auto-ticked, struck-through, green
│  ☑  Rotation revision · 5 Q        +20 XP   │
│  ☑  Organic PYQ · 8 Q              +30 XP   │
│  ○  Calculus practice · 12 Q       +50 XP   │  ← current (highlighted, pulse dot)
│     ▶ Start  · ~15 min · 4/12 done          │
│  ○  Waves quick-fix · 5 Q          +20 XP   │  ← locked-feel, dimmed
├─────────────────────────────────────────────┤
│  🎯 Finish all 5 → +100 XP bonus + 🏆 badge │
└─────────────────────────────────────────────┘
```

### Behaviour rules

1. **Auto-tick, no manual "Done" button.** Question solve karte hi (existing `bump_mission_progress_by_chapter` RPC + realtime subscription), row me progress bar bharta hai. Target hit → row satisfying animation ke saath ticks off (checkmark draw + slight bounce + XP counter fly to header).
2. **Sequential focus.** Sirf **ek** row "current" hoti hai (highlighted, expanded with Start button). Baaki rows compact single-line. Complete hone pe next row auto-becomes-current.
3. **XP over percentile.** Har task pe XP value visible. Header me today's XP counter live update. Streak + XP = engagement currency (percentile ki jagah).
4. **Realtime sync.** Existing `visibilitychange` refetch + Supabase realtime channel on `daily_missions` row. Tab wapas aate hi UI already updated.
5. **Completion celebration.** Saare 5 tick → full-screen confetti + "Aaj ka mission clear! Streak safe 🔥 · +100 bonus XP" card + "Kal ka teaser" (blurred preview of tomorrow's first task, unlocks 6 AM).
6. **Empty/late-day states.**
   - Sab done: "Ek aur round?" → optional bonus 5 Q from weakest chapter (extra XP, doesn't affect streak).
   - Din khatam, incomplete: "Kal fresh start. Ye 2 tasks kal reschedule ho gaye" (gentle, no shame).
7. **Kyun/Kya (context) — on tap only.** Har row tap karo → bottom sheet me chhoti explanation: "Ye kyun aaj: Last week Thermo me 52% tha, aaj fix karenge." No walls of text on main screen.

### What gets removed / merged

- ❌ `MissionCompleteCard` heavy version → replaced by lightweight confetti + XP card
- ❌ "JEEnie note" collapsible, "Rank-chase" strip, "Weekly report" panel → all gone from planner screen (move to Analytics page if needed)
- ❌ Roadmap tab as separate mental model → keep as `/roadmap` route but add small "📖 Full syllabus map" link at bottom of Hit-List
- ❌ Percentile chip, rank prediction band
- ✅ Streak chip stays (top-left)
- ✅ XP counter (new, top-right)

### Data model — reuse what exists

- `daily_missions` table already stores today's blocks with `progress`, `target`, `chapter_id`, `status`. Perfect for Hit-List rows — no schema change needed.
- Add one column: `daily_missions.xp_reward INT DEFAULT 20` (per block). Filled by `generate-daily-mission` edge fn based on target size.
- New `profiles.daily_xp INT` + `profiles.total_xp INT` — increment via existing `bump_mission_progress_by_chapter` when block completes.

### Files to edit (Part B)

- **`src/components/planner/CoachMissionPanel.tsx`** — full rewrite as `HitListPanel` (~200 lines, was 600+). List rows, current-row expansion, auto-tick animation, XP fly.
- **New `src/components/planner/HitListRow.tsx`** — single row component with three states (done/current/upcoming).
- **New `src/components/planner/CompletionCelebration.tsx`** — confetti + XP card + tomorrow teaser.
- **`supabase/functions/generate-daily-mission/index.ts`** — add `xp_reward` per block (5 Q = 20 XP, 10 Q = 40 XP, PYQ = 1.5x).
- **New migration** — add `xp_reward` to `daily_missions`, add `daily_xp` + `total_xp` to `profiles`, update `bump_mission_progress_by_chapter` RPC to increment XP + mark block done when `progress >= target`.
- **`src/pages/PracticePage.tsx`** — on question submit, existing RPC call now also returns `xp_gained` and `block_completed` bool; show tiny toast "+8 XP" on each correct, "+40 XP · Task complete! ✅" on block done.
- **`src/pages/AIStudyPlannerPage.tsx`** — no structural change, just renders the new HitListPanel.
- **`src/hooks/useStreakData.tsx`** — extend to also return `daily_xp` + `total_xp` (single fetch).

### Implementation order

1. **Slice 1 (this build):** Hide percentile everywhere + Hit-List UI rebuild (rows, auto-tick, sequential focus, current-row expansion). Uses existing progress data — no DB changes yet.
2. **Slice 2 (next):** XP system migration + edge fn update + celebration card + tomorrow teaser.
3. **Slice 3 (later):** Bonus round, reschedule logic, roadmap-as-map link.

Slice 1 alone will make the planner feel like a real to-do list. Slice 2 adds the dopamine loop.

---

## Confirm before I build

- Slice 1 (percentile hide + Hit-List UI) — green light?
- XP naming OK, ya "Points" / "Coins" / kuch aur prefer karega?
- Confetti celebration cool hai, ya subtle checkmark-only prefer karega (less "gamey")?
