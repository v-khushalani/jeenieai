
# AI Planner — Clarity + Live Progress + Coach/Compete Vibe

Teri 4 complaints ko point-by-point fix karenge. Structure same rahega (Coach on top, Roadmap collapsible), lekin har block ab **clear, chapter-targeted, live-updating, aur coach-like** hoga.

---

## 1. "Samajh nahi aata kya karna hai / kyun karna hai" — Clarity fix

Har mission block card ko 3-line contract dega:

```text
┌─────────────────────────────────────────────┐
│ 🔴 WEAK FIX · Thermodynamics                │
│ Kyun: Last 8 me se 3 sahi (37%). Yahi topic│
│       JEE me 4-6 marks ka hai.              │
│ Kya:  12 targeted Q solve kar (~18 min)     │
│ Goal: 8/12 sahi = ✅ done, badge unlock     │
│                              [ Start → ]    │
└─────────────────────────────────────────────┘
```

- **Why line** (data-driven, JEEnie voice, Hinglish) — pehli baar "kyun" clearly dikhega.
- **Kya line** — exact task (Q count + time).
- **Goal line** — pass criteria user ko pehle se pata.
- Card ke color/icon se type instantly clear: 🔴 weak-fix, 🟡 revision, 🔵 learn, 🟣 PYQ, 🟠 mock.

## 2. "Start pe click karo, us hi chapter ke practice me jaana chahiye" — Deep linking fix

Aaj `action_href` generic hai (`/practice`). Change:

- Mission block me `chapter_id` store karenge (already partially there).
- `Start` button → `/practice?chapter=<chapter_id>&mode=<weak|revision|learn>&target=<n>&missionBlockId=<id>`
- `PracticePage` in params ko read karega:
  - `chapter` → sirf usi chapter ke Q filter
  - `mode=weak` → sirf pending mistakes / low-accuracy Q
  - `target=n` → sirf n Q serve kare, phir "Mission block complete" screen
  - `missionBlockId` → complete hone pe backend ko notify

## 3. "Jitne Q required utne hi aaye (not always 50)" — Dynamic question count

`generate-daily-mission` edge function me:

- Har block ka `question_count` ab data-driven:
  - **weak_fix**: `min(pendingMistakes + wrongIn(last 14 days), 15)` — usually 8-15
  - **revision**: `min(strongTopicQ * 0.2, 10)` — usually 5-10
  - **learn**: chapter ke syllabus % ke hisab se, 10-20
  - **PYQ**: 5 (curated)
  - **mock**: full/half based on `total_minutes`
- No hard-coded 50. Sirf `daily_target_minutes` ke andar fit ho.

## 4. "Q solve karu toh planner me reflect ho + auto-done" — Live sync

Naya lightweight system:

**a) Server-side block progress**
- `daily_missions.blocks` JSONB me har block ka `progress: { attempted: n, correct: n, status: 'pending|in_progress|done' }` add karenge.
- New edge function `update-mission-progress` (ya existing `validate_practice_answer` RPC me extend) — jab bhi answer submit ho aur `missionBlockId` present ho, corresponding block ka progress bump kare.
- Jab `attempted >= target` OR `correct >= passingGoal` → `status = 'done'`, `completed_blocks++`.
- Jab sab blocks done → mission `status = 'completed'` + streak bump + celebration.

**b) Client-side realtime**
- `CoachMissionPanel` me Supabase Realtime subscription on `daily_missions` row → UI instantly updates jab practice page pe koi Q solve ho.
- Har block card pe mini progress bar: `8/12 · 5 sahi`.
- Complete hone pe card green + confetti flash + "+15 XP" pill.

## 5. Personal Coach + Competitive vibe

**Coach vibe additions (top of panel):**
- **JEEnie greeting line** (dynamic, uses signal): _"Aaj Thermo fix kar liya toh percentile 91 → 93 jayega. Chal, 18 min ka game hai."_
- **Mid-day check-in nudge**: agar 2pm tak 0 block done → gentle push notification / banner.
- **End-of-day recap card**: _"Aaj 2/3 done. Kal PYQ ke saath open karenge."_

**Competitive layer (new strip below mission):**
- **Predicted rank ticker**: `#12,450 → #10,200` with arrow + delta (live update as blocks complete).
- **Daily challenge chip**: "Aaj top 500 users ne avg 45 min padha. Tu abhi 12 min." (rank percentile among active users today).
- **Streak flame** already hai — bada karenge + "Break karega toh -X percentile" warning at risk hours.
- **Friends leaderboard mini row** (if referrals exist) — top 3 friends ke aaj ke minutes.

---

## Files to touch

**Frontend**
- `src/components/planner/CoachMissionPanel.tsx` — new card layout (why/kya/goal), progress bars, realtime subscribe, coach greeting, competitive strip.
- `src/pages/PracticePage.tsx` — parse `chapter`, `mode`, `target`, `missionBlockId` from URL; enforce target; show "Mission block complete" screen on finish.
- `src/components/AIStudyPlanner.tsx` — small: pass fresh signals to panel, minor copy tweaks.
- New: `src/components/planner/CompetitiveStrip.tsx` — rank ticker + daily challenge + friends row.

**Backend (edge functions + DB)**
- `supabase/functions/generate-daily-mission/index.ts` — dynamic `question_count` logic, richer `why` string per block, `passing_goal` field, `chapter_id` in every block.
- `supabase/functions/compute-coach-signal/index.ts` — add `daily_rank_percentile` (among today-active users) + `friends_today` array.
- New edge function `update-mission-progress` (or extend `validate_practice_answer`) — bump block progress on each attempt.
- Migration: `daily_missions.blocks` JSONB shape extended (no schema change, just documented shape); enable Realtime on `daily_missions`.

**Out of scope**
- No changes to roadmap ladder, badges system, or subscription gating.
- No new tables; reuse `daily_missions`, `question_attempts`, `profiles`.

---

## Technical details

- Realtime: `ALTER PUBLICATION supabase_realtime ADD TABLE public.daily_missions;` + RLS check that user can only subscribe to own row.
- PracticePage target enforcement: after Nth answer, block further Q loads, show summary screen with `correct/target`, XP earned, "Next block" CTA linking to next pending block from same mission.
- `update-mission-progress`: idempotent — dedupe by `(mission_id, block_id, question_attempt_id)` inside the JSONB so retries are safe.
- Coach greeting: composed in `compute-coach-signal` (server-side, uses Lovable AI Gateway `google/gemini-2.5-flash` for one-line Hinglish message; cached for the day).

Ready to build?
