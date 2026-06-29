## Reimagine AI Planner — "JEEnie Mentor Roadmap"

Goal: replace the current generic 3-tab planner with a **personal mentor roadmap** that walks the student syllabus-wise, chapter by chapter, telling exactly what to do next — practice → weak-spot drill → revision → chapter test → move on.

Everything is deep-linked, so tapping any step opens the right Practice/Test page with the right filters.

---

### Core idea

```text
JEEnie: "Puttar, abhi tu yahaan hai —"

┌─ Your Roadmap (Physics · Class 11) ────────┐
│ ✅ 1. Units & Measurements   100%  ⭐⭐⭐    │
│ ✅ 2. Kinematics              92%  ⭐⭐⭐    │
│ 🔵 3. Laws of Motion          ── ACTIVE ──  │
│      ├─ ◉ Learn 15 Qs (8/15) → [Practice] │
│      ├─ ◯ Fix weak: Friction  → [Drill 10]│
│      ├─ ◯ Revise mistakes (6) → [Review]  │
│      └─ ◯ Chapter test 20 Qs  → [Test]    │
│ 🔒 4. Work, Energy & Power                  │
│ 🔒 5. Rotational Motion                     │
│ 🔒 6. Gravitation                           │
│ …                                            │
└─────────────────────────────────────────────┘

Today's focus (auto): finish Step 1 of "Laws of Motion"
Weekly checkpoint (Sun): Mock test on chapters 1-3
```

The user does not "browse" — JEEnie always tells them the next single action.

---

### Tabs (3, focused)

**Tab 1 — Roadmap** (the hero)
- Subject switcher: Physics / Chemistry / Math (or NEET equivalents)
- Vertical ladder of chapters in `chapter_number` order
- Each chapter card = 4 milestones with auto-progress + tap-to-act:
  1. **Learn** — 15 fresh Qs from that chapter (`/practice?chapter=…&mode=learn`)
  2. **Fix weak spots** — auto-detect sub-topic with <60% accuracy; 10-Q drill
  3. **Revise mistakes** — re-do wrong attempts (`/practice?chapter=…&mode=review`)
  4. **Chapter test** — 20-Q timed test → unlocks next chapter
- States: ✅ done · 🔵 active · 🔒 locked (greys out, "Finish Ch.3 first")
- Mastery stars: ⭐ ≥70%, ⭐⭐ ≥85%, ⭐⭐⭐ ≥92%

**Tab 2 — This Week**
- 7-day mentor schedule built from current roadmap position:
  - Mon-Fri: daily target = next 1-2 milestones (15-30 mins)
  - Sat: weak-spot consolidation
  - Sun: **weekly checkpoint test** across completed chapters
- Tick-off auto-syncs from `question_attempts`
- "Behind / on-track / ahead" badge

**Tab 3 — Mentor Notes**
- 1 short Hinglish nudge from JEEnie daily (Gemini, cached) tied to roadmap position
- Exam readiness % = weighted (chapters cleared × subject weightage), with delta vs last week
- "Aaj ka focus" + "Kal kya karna hai" — 2 lines, no fluff

---

### How chapter order is decided

Deterministic, per subject, per user goal:
1. Pull `chapters` where `is_active = true` and `exam_relevance` includes user's exam
2. Sort by `(class_level asc, chapter_number asc)`
3. Active chapter = first chapter whose all 4 milestones are not complete
4. Locked = every chapter after the active one (sequential unlock)
5. User can override (long-press → "Start from here") — counted as skip, JEEnie nudges to come back

### How each milestone is tracked (no new heavy tables)

Reuse existing `question_attempts` + extend `study_plan_progress`:
- Learn done = ≥15 attempts in that chapter with ≥60% accuracy
- Weak-spot done = drill set marked complete OR sub-topic accuracy crossed 70%
- Revise done = all prior wrong attempts re-answered (or count = 0)
- Chapter test done = a `test_sessions` row with `chapter_id = X` and score ≥60%

Cache the computed milestone state per (user, chapter) in `study_plan_progress` so the roadmap loads instantly; recompute on tab focus + after each attempt.

### Deep-link contract (Practice/Test already exist)

- Practice learn: `/practice?chapterId=…&mode=learn&target=15`
- Weak drill: `/practice?chapterId=…&topicId=…&mode=drill&target=10`
- Review: `/practice?chapterId=…&mode=review`
- Chapter test: `/test?chapterId=…&questions=20&timed=1`
- Weekly checkpoint: `/test?chapters=ch1,ch2,ch3&questions=30&timed=1`

`PracticePage` / `TestPage` already accept chapter filters — only the mode/target/review params need to be honored (small additions, no rewrite).

### AI usage (cheap)

One Gemini call per user per day, cached:
- Input: current chapter, last 7 days accuracy, weak topic name
- Output: ~40-word Hinglish mentor note for Tab 3 + 1-line "aaj ka focus"
- Reuses existing `generate-study-plan` edge function (extended, not new)

### What's removed

- Current generic "Warmup/Focus/Stretch/Cooldown" Today tab — gone
- Current "Week heatmap + subject load" view — replaced by mentor weekly schedule
- Current free-form SWOT/insights — replaced by roadmap-aware Mentor Notes
- `studyPlannerCore.ts` topic-priority math — replaced by the deterministic roadmap engine

Nothing else in the app changes (Practice page, Tests, Badges, Analytics, Doubt Solver, Roast all untouched).

---

### Technical sketch (for review)

New file: `src/lib/roadmapEngine.ts`
- `buildRoadmap(userId, subject)` → returns `Chapter[]` with milestone states
- Pure functions, deterministic; reads `chapters`, `question_attempts`, `test_sessions`, `study_plan_progress`

Refactor: `src/components/AIStudyPlanner.tsx`
- Replace Today tab with `<RoadmapView />` (subject switcher + chapter ladder + milestone chips)
- Replace Week tab with `<MentorWeekView />` (7-day plan derived from roadmap)
- Replace Insights tab with `<MentorNotesView />` (cached Gemini note + readiness %)

Small extension: `src/pages/PracticePage.tsx` + `src/pages/TestPage.tsx`
- Honor `mode=learn|drill|review` and `target` query params
- `mode=review` filters to questions previously answered incorrectly by this user
- `mode=drill` accepts a `topicId` filter

Migration:
- Extend `study_plan_progress` with `chapter_id`, `milestone` (enum: learn/drill/review/test), `status`, `last_synced_at`
- Add unique index on `(user_id, chapter_id, milestone)`
- Add `GRANT`s and RLS scoped to `auth.uid()`

Edge function:
- Extend `generate-study-plan` with a new `mode=mentor_note` path returning the short Hinglish note; cache by `(user_id, date)`

Dashboard card (already wired) becomes:
> "Roadmap · Laws of Motion · Step 2 of 4 · 12 min" → opens Tab 1

---

### Build order (incremental, each shippable)

1. **Migration** — extend `study_plan_progress`
2. **Roadmap engine** — pure logic + tests
3. **Roadmap tab UI** — replaces Today tab; deep-links into existing Practice/Test
4. **Practice/Test query-param honoring** — `mode=learn|drill|review`, `target`
5. **Mentor Week tab** — derived 7-day plan
6. **Mentor Notes tab + edge fn extension** — cached daily note + readiness %
7. **Dashboard card copy update** to roadmap-aware text
8. **Cleanup** — delete `studyPlannerCore.ts` + old Today/Week/Insights code paths

Approve karein toh slice 1 (migration) se start karunga — safe, reversible. Ya koi slice skip / order change karna ho toh batao.
