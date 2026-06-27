# JEEnie v2 — Today's Mission Engine

## Goal

One always-visible "🎯 Today's Mission" card at the top of the dashboard that tells the student exactly what to do next, persisted for the day, and driven by deterministic rules (no AI cost). The AI Study Planner's Today tab becomes the expanded view of the same mission — single source of truth. No existing feature is removed.

## Decisions locked

- **Engine:** deterministic (Postgres + client rules). Zero Gemini calls per dashboard open.
- **Mission ↔ Planner:** one source of truth. Planner Today tab reads the same `daily_missions` row.
- **Cold start:** student starts from chapter 1 (chapters are already arranged in proper sequence); engine takes over from next session.
- **Mission lock:** any practice on the mission's chapter counts — since "Continue Mission" routes into Study Now anyway, organic chapter practice contributes naturally.
- **Notifications:** max 1 mission notification per day.
- **Design:** zero changes to brand, typography, nav. Mission card uses existing Card + Progress + Button primitives.

## Dashboard order (mobile + desktop)

1. 🎯 Today's Mission (new hero)
2. Continue Journey (existing, unchanged)
3. Readiness / KPI strip (existing)
4. Weak Topics, Recent Performance, Mocks, Free Practice, Leaderboard… (all existing, unchanged order)

## Mission Engine — rules (priority order)

The first rule that matches wins. All inputs come from existing tables.

1. **Overdue revision** — `topic_mastery.next_review_date < today` → mission = "Revise &nbsp;".
2. **Weak topic blocking current chapter** — accuracy < 60% on a topic in the active chapter → mission = "Fix weak topic: &nbsp;".
3. **Active chapter incomplete** — chapter has unattempted questions or mastery < threshold → mission = "Continue practice: &nbsp;".
4. **Chapter practice done, mastery test pending** → mission = "Mastery test: &nbsp;".
5. **Mastery done, PYQs pending** → mission = "PYQ challenge: &nbsp;".
6. **Everything done on current chapter** → mission = "Start next chapter: &nbsp;".
7. **Cold-start (0 attempts and no picked chapter)** → mission = "Pick your starting chapter" with inline picker (subject + chapter dropdown sourced from `chapters` table for the user's exam/grade).
8. **Mock-test cadence** (every 7th day if streak ≥ 7) → mission = "Take a full mock".

Chapter sequence = `chapters.order_index` for the user's exam + grade. "Current chapter" = most recently practiced chapter with progress < 100%, else first chapter with order_index after the last completed one.

## Mission card contents

- Title (e.g. "Continue Practice — Chemical Bonding")
- Subtitle / Hinglish hook (static templates per rule type, no AI)
- Progress bar (questions done today on this mission / target)
- Estimated time (questions_remaining × avg_time_per_q from user history, default 90s)
- Reward chip: "+50 JEEnie pts on completion"
- Primary CTA: **Continue Mission** → deep links into the right route with filters preloaded:
  - practice/weak/mastery → `/study-now?subject=X&chapter=Y&mode=…`
  - revision → `/study-now?mode=revision&topic=…`
  - PYQ → `/study-now?mode=pyq&chapter=…`
  - mock → `/test?type=mock`
  - cold-start → opens inline picker, writes choice, regenerates mission immediately

## Persistence

New table `daily_missions` (one row per user per IST day, locked once generated):

- `user_id`, `mission_date` (date, IST), `rule_id` (text, e.g. `weak_topic`), `subject`, `chapter`, `topic` (nullable), `target_count` (int), `est_minutes` (int), `reward_points` (int), `status` ('pending' | 'in_progress' | 'completed'), `progress_count` (int).
- Unique on (`user_id`, `mission_date`).
- RLS: user reads/writes their own; service_role full.
- GRANTs to `authenticated` and `service_role` (no anon).

Generation: client calls a Postgres RPC `get_or_create_today_mission()` on dashboard load. RPC reuses today's row if it exists; otherwise runs the rule chain and inserts. This guarantees mission is stable across reloads.

Progress sync: extend the existing `update_practice_stats` trigger to also bump `daily_missions.progress_count` and flip `status` to `completed` (awarding `reward_points` via existing points pipeline) when threshold hit. No double-counting — any chapter-matching practice counts.

## AI Planner integration (no duplication)

- Planner "Today" tab fetches the same `daily_missions` row and renders it as the primary block, with the existing time-slot suggestions shown below as "supporting tasks".
- Planner "This Week" and "Insights" tabs unchanged.
- The old "Smart Suggestion" card in Planner is removed (mission supersedes it).

## Notifications

- One push/in-app notification per day at the user's preferred study hour (reuse existing `usePushNotifications` + cron): "🎯 Aaj ka mission ready hai — &nbsp;".
- If mission still pending at 8pm IST: "🔥 Streak bachani hai? 10 min do — &nbsp;".
- No other mission spam.

## Future plug-ins (designed-in, not built now)

The `rule_id` field is open-ended; future resources (videos, summaries, concept maps, flashcards) become new rules without schema change. Example: on a wrong answer, a follow-up mission `rule_id = 'concept_recovery'` can recommend Concept Map → Retry. This plan does NOT build those resources yet — only ensures the engine can host them.

## What we will NOT touch

- Brand colors, typography, navigation, existing card layouts below the hero.
- AI Doubt Solver, badges, streaks, XP rules, Analytics, leaderboard.
- Existing question bank, chapter, topic_mastery tables (read only; no schema change).

## Technical section

**New files**

- `src/components/mission/TodaysMissionCard.tsx` — hero card
- `src/components/mission/MissionPicker.tsx` — cold-start chapter picker
- `src/lib/missionEngine.ts` — rule chain (pure functions, unit-testable)
- `src/hooks/useTodaysMission.ts` — fetch + realtime subscribe to `daily_missions`

**Edited files**

- `src/pages/EnhancedDashboard.tsx` — mount `<TodaysMissionCard />` at top of grid (mobile and desktop), above all existing cards. No other layout changes.
- `src/components/AIStudyPlanner.tsx` — Today tab pulls from `useTodaysMission`; remove old Smart Suggestion card.
- `src/pages/StudyNowPage.tsx` — read URL params for `subject`, `chapter`, `mode`, `topic` and call existing batch builder with those filters (most params already supported; verify `mode=revision|pyq`).

**DB migration**

- `daily_missions` table + RLS + GRANTs + unique index.
- RPC `public.get_or_create_today_mission(p_user uuid)` returning the row; implements the rule chain in SQL using `topic_mastery`, `chapters`, `question_attempts`, `profiles`.
- Trigger extension on `question_attempts` insert to bump `daily_missions.progress_count` and complete the mission when matched.

**Rule chain (SQL, simplified)**

```text
1. SELECT topic from topic_mastery where next_review_date < today  → revision
2. SELECT topic from topic_mastery where chapter = active_chapter and accuracy < 60  → weak_topic
3. IF active_chapter has unanswered questions  → chapter_practice
4. ELSIF mastery_test_taken = false           → mastery_test
5. ELSIF pyq_done = false                     → pyq_challenge
6. ELSE                                       → next_chapter (order_index + 1)
7. day-7 cadence + streak ≥ 7                 → full_mock (override of 3-6)
8. zero attempts and no picked chapter        → cold_start
```

**Reward**  
question solve karne pe toh mil rahe hai na points, and badges (streak complete hone pe kuch jeenie points denge as a reward)

**Out of scope (explicit)**

- Building videos/summaries/flashcards content.
- Redesigning any existing component.
- Changing streak, XP, or badge rules.