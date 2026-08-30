# JEEnie: Mascot Button, Planner 2.0, and Rewards Program

Three tracks: fix the floating AI button visual, rebuild the AI Study Planner into a dead-simple addictive daily loop, and add a rewards system with real prizes tied to streaks and subscriptions.

---

## 1. JEEnie mascot on the floating button

Today the floating doubt-solver button shows a plain lightning bolt inside a navy circle, plus a hover glow overlay that reads as a broken/incomplete graphic.

Changes:
- Generate a proper JEEnie mascot: a friendly navy-and-blue genie character (smiling face, wisp/lamp tail, spark accent) on a transparent background, in the app's premium navy (#013062) palette.
- Replace the bolt icon on the floating button with the mascot image; remove the extra blur/gradient overlay layers that cause the artefact on hover.
- Hover state: gentle bounce + soft navy halo ring only (no half-rendered gradients). Idle state keeps the reduced opacity behaviour.
- Reuse the same mascot in the chat header avatar and in the planner's coach messages so JEEnie has one consistent face.

---

## 2. AI Study Planner 2.0 — "One Screen, One Next Step"

Problem: the planner currently opens on tabs (Mastery Ladder / Missions) with dense cards, numbers, and text. Students have to decide what to do.

Principle: the student should never choose. The planner answers exactly one question: **"What do I do right now?"**

### Layout (single scroll, no tabs at top)
```text
┌──────────────────────────────────────┐
│  Streak 🔥 12   •   Points 2,340     │  slim status bar
├──────────────────────────────────────┤
│  TODAY'S MISSION            3 / 5 ✓  │
│  ┌────────────────────────────────┐  │
│  │  NEXT UP                       │  │
│  │  Rotational Motion · 10 Qs     │  │  ONE giant primary card
│  │  ~12 min · +40 points          │  │
│  │        [  START  →  ]          │  │
│  └────────────────────────────────┘  │
│  ● ● ● ○ ○   (chain dots, auto-tick) │
├──────────────────────────────────────┤
│  🎁 Daily Vault      (locks/unlocks) │
│  📜 Weekly Contract  (progress bar)  │
│  🗺️ My Journey       (collapsed)     │
└──────────────────────────────────────┘
```
- The big card is always the single next step; finishing it auto-advances with a satisfying tick + points burst, no page reload.
- Chain dots replace the current multi-card list — the rest of today's steps stay collapsed until reached (curiosity preserved).
- Mastery Ladder / Roadmap becomes a collapsed "My Journey" section at the bottom, not a competing tab.
- All numeric/analytical text trimmed to at most one line per card; jargon (accuracy %, priority score) hidden behind a small "details" toggle.

### Addiction mechanics (all reuse JEEnie Points — no new currency)
- Combo meter: consecutive correct answers grow a multiplier bar; breaking it visibly resets — creates tension.
- Auto-tick animation + haptic-style pulse and a short celebration when a mission step closes.
- Streak shield UI: shows exactly what the student loses by skipping today.
- "Comeback" state: when a student misses a day, the planner opens with a 3-question rescue mission instead of guilt text.
- Mystery step: the last step of the day is hidden ("???") until unlocked.
- Daily cliffhanger: after completing today, show a one-line teaser of tomorrow's mission.

### Simplicity guardrails
- First-time users see a 3-tap setup (exam, class, minutes/day) — nothing else.
- Empty/edge states never show a blank screen; they show a starter mission.
- Everything is reachable in one tap from the big card.

---

## 3. Rewards program — streak prizes that also sell subscriptions

New dedicated page `/rewards` (entry points: planner status bar, profile, dashboard tile) with three sections.

### A. Vault (existing, virtual)
Daily vault claim: points, streak freeze, cosmetic titles. Stays free for all.

### B. Milestone Rewards (streak ladder)
| Streak | Reward | Cost to us |
| --- | --- | --- |
| 7 days | Streak freeze + badge | ₹0 |
| 30 days | 1 month Pro free (or extension) | ₹0 marginal |
| 100 days | JEEnie merch: sticker pack + notebook | ~₹150 |
| 180 days | Branded hoodie / premium stationery kit | ~₹700 |
| 365 days | Grand prize: iPad / laptop (single national winner per cycle) | capped |

Feasibility rule: everything up to 180 days is *guaranteed*; the 365-day tier is a **lucky-draw among all 365-day streak holders** (1 iPad per cycle, plus runner-up prizes: earbuds, tablet-stand kits, coaching vouchers). This caps liability at one device instead of unlimited devices.

### C. Points Store
Spend JEEnie Points on low-cost, high-perceived-value items: streak freezes, avatar frames, PYQ packs, mock-test unlocks, 1-week Pro trial, entry tickets to the monthly draw. Pro/Pro+ earn points at 1.5x/2x — this is the main subscription pull.

### Plan/pricing tie-in (current: Pro ₹149/mo, ₹1199/yr; Pro+ ₹249/mo, ₹1999/yr)
- Add reward framing to the pricing page: "Pro+ = 2x points = 2x draw entries + guaranteed merch at 100 days."
- Add an annual-only perk: yearly subscribers auto-qualify for the grand draw even if a streak breaks once (one forgiveness).
- Profitability guard: prize budget capped at a fixed % of monthly subscription revenue, shown internally in the admin dashboard; draws only run when the cap is met.

### Rules and anti-abuse
- Streak counts only days with verified non-test question attempts (existing rule).
- Server-side eligibility check; prizes require verified phone + real name + address at claim.
- Terms page section for the draw (eligibility, one prize per user per cycle, no cash equivalent).

---

## Technical notes
- Mascot: generated asset in `src/assets`, imported directly; button markup in `AIDoubtSolver.tsx` simplified (drop the stacked gradient/blur divs).
- Planner: restructure `AIStudyPlanner.tsx` into a single-column shell; `MissionChain.tsx` becomes chain-dots + one active `MissionCard`; ladder moves into a collapsible section using existing `InteractiveStudyLadder`/`RoadmapView`.
- Combo meter and celebrations are presentation-only on top of existing `bump_mission_block_progress` / points RPCs.
- Rewards: new `/rewards` page reusing `RewardVault`, `ContractStrip`, badges; new tables for milestone claims, points-store purchases, and draw entries, each with grants + RLS and a security-definer RPC for redemption (no client-side awarding).
- Admin: reward-claims queue (approve/ship/reject) in the existing admin dashboard.

## Suggested order
1. Mascot + button fix (fast, visible)
2. Planner 2.0 shell + one-next-step loop
3. Combo/celebration polish
4. Rewards page + points store + milestone claims + admin queue
