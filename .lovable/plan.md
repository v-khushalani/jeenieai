
# AI Planner — Honest Analysis + Redesign Plan

## Tere 4 sawaal ka seedha jawab

### 1. "Bohot zyada text hai" — Haan, sach hai

Abhi ek block card me: type badge + title + subtitle + Kyun line + Kya line + Goal line + progress bar + expand chevron + Start button. Upar se: weekly report card + JEEnie greeting card + prediction card + streak pill + nudge banner + log-class card + competitive strip. **Ek screen pe 8+ cards, 200+ words.** Koi nahi padhega — tu sahi keh raha hai.

**Fix:** Har mission block = **1 line + 1 button.** Kyun/Kya/Goal ko chhota "ℹ️" tap pe hi dikhao. Upar ka clutter (weekly report, greeting, nudge, competitive strip) ek collapsible "Coach note" me daal do. Default view = sirf 3-4 blocks + streak flame + percentile number.

### 2. "Questions solve karne se planner update nahi ho raha" — Half-broken

Code me realtime subscription hai (`daily_missions` UPDATE) aur `bump_mission_block_progress` RPC bhi hai. Lekin practical me ye tab fail hoti hai jab:
- User `?mission_id=&block_id=` ke bina practice khole (normal Study Now se) → RPC call hi nahi hoti, planner never updates.
- Realtime publication table pe enabled hai but RLS filter ke wajah se client ko row nahi milti.
- Optimistic UI nahi hai — user solve karke wapas planner pe aata hai to network round-trip lagta hai.

**Fix:** (a) `bump_mission_block_progress` ko har question attempt pe call karo, mission_id/block_id automatic infer karo current chapter se — deep link zaroori na ho. (b) Planner pe wapas aane pe `refetch` on visibility change. (c) Optimistic bump on submit + realtime confirm.

### 3. "Mission complete ho gaya toh curiosity khatam?" — Bilkul, aaj to dead-end hai

Aaj sab blocks done = "Shabaash" text + kuch nahi. **Zero pull to come back.**

**Fix — Completion = new curiosity trigger:**
- **"Kal ki mission unlock"** preview card (blurred/locked) — "Kal Thermo chapter test hai, aaj raat 11 baje se open"
- **Bonus challenge**: "5 extra PYQ solve → +2 rank jump" (optional, rewarding not mandatory)
- **Streak flame animation** + "Chain: 12 days 🔥, kal break hua toh -3 percentile"
- **Percentile ticker** live update (91 → 91.4 with tiny +0.4 pop)
- **Tomorrow preview**: 1-line teaser of tomorrow's hardest block

### 4. "Roadmap better ya AI Planner?" — Dono ka role alag, but UI me confuse ho raha

**Sach:** Roadmap = **strategic view** (start-to-end syllabus ladder, "kaunsa chapter next"). AI Planner = **tactical view** (aaj kya karo). Dono zaroori hain, lekin abhi wo do alag jagah exist karte hain, isliye "sab complete karna hai na?" wala doubt aata hai.

**Fix — Merge into one flow:**
- **Roadmap is source of truth.** Chapter ladder end-to-end, subject-wise, star-based mastery.
- **Today's Mission** = next 2-4 pending milestones from roadmap, auto-picked. Not a separate plan.
- Ek button: "Start today's chapter" → seedha active chapter ke pending milestone pe. Poora syllabus visible bhi rahega scroll karne pe.
- Poora "complete karna hai" clear — roadmap dikhata hai `12/40 chapters cleared`.

---

## Redesign Plan (build karne ke liye)

### Screen structure (top → bottom)

```text
┌─ Sticky top: [streak 🔥 12d]  [percentile 91.2 ↑]  [refresh] ┐
├────────────────────────────────────────────────────────────────┤
│ AAJ (3 mission cards, minimal)                                 │
│  ┌─────────────────────────────────────┐                       │
│  │ 🔴 Thermo · Weak fix        8/12 ●●●─  [Start →]           │
│  ├─────────────────────────────────────┤                       │
│  │ 🟣 5 PYQ · Physics          0/5   ───   [Start →]           │
│  ├─────────────────────────────────────┤                       │
│  │ ✅ Rotation revision        10/10 done                      │
│  └─────────────────────────────────────┘                       │
│  [ℹ Why these?]  ← collapsed by default                         │
├────────────────────────────────────────────────────────────────┤
│ ROADMAP (Physics · Chem · Math tabs)                           │
│  12/40 chapters cleared ━━━━━━━━━━━━━━━━━━━ 30%                │
│  Chapter ladder (scrollable)                                   │
└────────────────────────────────────────────────────────────────┘
```

Weekly report + JEEnie greeting + nudge → all move inside **[ℹ Why these?]** collapsible. Log Class → small "+ log class" chip in top bar, not a full card.

### Live sync fix

- Extend `bump_mission_block_progress` RPC: agar `mission_id/block_id` null hain but attempt ka `chapter_id` kisi aaj ke mission block se match kare, tab auto-match karke bump karo. Isse Study Now se solve karne pe bhi planner update ho.
- `PracticePage`: submit ke turant baad optimistic local state bump + RPC call, phir realtime confirm.
- `CoachMissionPanel`: `document.visibilitychange` pe refetch — user planner pe wapas aaye to fresh state.

### Completion loop (new curiosity)

- Naya component `MissionCompleteCard.tsx` — sab blocks done hone pe replace kare mission list ko:
  - Big percentile delta animation
  - Streak flame + "next milestone in X days"
  - "Kal ka preview" (locked card, 1-line teaser from tomorrow's `generate-daily-mission` dry-run)
  - Optional "Bonus challenge" chip
- Push a small toast every time a block completes: `"+0.3 percentile • Thermo done ✅"`.

### Roadmap ↔ Planner merge

- Remove standalone "AI Planner" clutter; keep RoadmapView as anchor.
- `generate-daily-mission` already uses chapters — expose it as "Today's slice of roadmap" heading, not a separate universe.
- Roadmap chapter card pe agar wo chapter aaj ki mission me hai → chhota "AAJ" tag lagao. Ek concept, do views.

### Files to touch

- `src/components/planner/CoachMissionPanel.tsx` — strip to minimal block cards, collapse everything secondary, add `MissionCompleteCard`, visibility-change refetch.
- `src/pages/PracticePage.tsx` — optimistic block bump on submit; call RPC even without deep-link params if chapter matches today's mission.
- `supabase/functions/generate-daily-mission/index.ts` — trim block copy (no long "why" strings; keep short chip); add "tomorrow preview" endpoint mode.
- `supabase/migrations/*` — patch `bump_mission_block_progress` to auto-match by (user_id, today, chapter_id) when block_id absent.
- `src/components/AIStudyPlanner.tsx` — reorder: sticky header → today mission → roadmap. Drop weekly-plan tab (already covered by roadmap).
- New: `src/components/planner/MissionCompleteCard.tsx`, `src/components/planner/StickyPlannerHeader.tsx`.

### Out of scope

- No new tables. No new gamification systems (badges/friends leaderboard stay as-is).
- No changes to subscription gating, Study Now internals beyond the optimistic bump.
- Roadmap engine logic (`roadmapEngine.ts`) stays; only visual placement changes.

---

**TL;DR:** Text 70% kam karna hai, live-sync ko chapter-level pe auto-match karna hai, mission-complete pe ek curiosity hook (tomorrow preview + percentile pop) daalna hai, aur roadmap ko main anchor banake planner ko uska "aaj wala slice" bana dena hai.

Ready to build?
