# JEEnie v3 — Merged Execution Plan

## Comparison verdict

Your v3 plan is stronger than mine and should be the base. Where they differ:

| Area | My plan | Your v3 | Take |
| --- | --- | --- | --- |
| Planner | one-next-step card, chain dots | same + timer pressure, resume-state entry, near-win copy, comeback ladder | Your v3 — richer behavioural loop |
| Mascot | static visual fix | visual fix + state-reactive behaviour (idle/combo/risk/comeback) | Your v3 |
| Rewards | daily vault + milestones + store | adds weekly loop + monthly draw + redeem-with-points merch + dynamic pricing | Your v3 — far safer on cost |
| Subscription | 1.5x/2x points | same, plus positioning "progress faster, not more features" | Your v3 |
| Social / push | not covered | leaderboard + streak-risk notifications | Your v3 |
| Cost control | prize budget cap | cap + redeem-not-gift + one prize per cycle | Both, keep cap |

Two things from my plan worth keeping: the 3-tap first-run setup (exam, class, minutes/day) and folding the existing Mastery Ladder into a collapsed "My Journey" instead of deleting it.

Two cautions on v3:
- Dynamic points-store pricing is easy to get wrong and confuses students. Ship fixed prices first; add demand-based adjustment later behind an admin control.
- Physical merch and the monthly draw need legal/ops (address collection, shipping, T&Cs). Build the software rails now, switch the draw live only when the budget cap and T&Cs are ready.

Recommendation: build v3 in the order below, with those two adjustments.

---

## Phase 1 — Planner core loop (highest priority)

Single screen, no tabs.

```text
🔥 12   •   2,340 pts                    [status bar]
────────────────────────────────────────
TODAY'S MISSION            2 steps left to secure streak
┌──────────────────────────────────────┐
│  NEXT STEP        ⏱ 11:42 counting   │
│  Rotational Motion · 10 Qs           │
│  +40 pts   ·   combo ×3 live         │
│            [  START →  ]             │
└──────────────────────────────────────┘
● ● ● ○ ?          (last step hidden)
────────────────────────────────────────
🎁 Daily Vault   📜 Weekly   🗺️ My Journey ▸
```

- Entry rule: unfinished step → "Resume where you left off"; else "Complete today's step in ~12 min". One CTA.
- Tap START → timer starts → questions → tick + points burst + combo update → auto-advance. No reloads, no choices.
- Near-win copy replaces raw counters ("2 steps left to secure streak").
- Combo bar ×1→×5, resets on wrong answer, visible at all times.
- Loss-aversion line shown only when the streak is actually at risk.
- Mystery final step "???" resolving to 2x points / easy win / rapid-fire.
- Daily cliffhanger teaser after completion.
- Weak topics → shorter, more frequent steps; strong topics → challenge mode.
- First run: 3 taps (exam, class, minutes/day). Mastery ladder + roadmap live inside collapsed "My Journey".

## Phase 2 — Comeback + re-engagement

- Missed 1 day → 3-question rescue mission; 2 days → 2-minute quick restart; 3+ → fresh restart, no penalty, no guilt copy.
- Push notifications on streak risk, unfinished mission, near reward unlock. Capped per day, India-time aware.

## Phase 3 — Rewards

- Weekly loop first (3 days → bonus points, 5 → streak shield, 7 → draw entry).
- Monthly draw next (earbuds, books, Pro+, vouchers; entries from points + streak).
- Then milestones (7 badge, 30 one month Pro, 100/180 merch **unlock**, 365 grand draw entry) — merch always redeemed with points, never auto-shipped.
- Points store with fixed prices at launch: streak freeze, avatar frames, PYQ packs, mock tests, Pro trial, draw tickets. Admin-tunable prices; demand-based pricing later.
- `/rewards` page, linked from planner top bar, profile, dashboard.

## Phase 4 — Mascot emotional layer

- Generate navy (#013062) genie mascot, transparent PNG.
- Floating button: mascot replaces the bolt; delete the stacked gradient/blur divs causing the hover artifact; hover = bounce + soft halo ring; idle = reduced opacity.
- Same mascot in chat header and planner coach line.
- State machine: idle nudge / high-combo hype / streak-risk warning / comeback support, with the Hinglish microcopy from your plan.

## Phase 5 — Social layer

- Weekly streak and points leaderboards, "ahead of X% students" social proof, optional friend compare. Opt-out respected.

---

## Technical notes

- Planner: rebuild `AIStudyPlanner.tsx` as a single-column shell; `MissionChain.tsx` → chain dots + one active `MissionCard`; ladder/roadmap moved into a collapsible section. Combo, timer, celebrations are presentation state on top of existing `bump_mission_block_progress` and points RPCs.
- New tables (each with GRANTs + RLS, security-definer RPCs for all awarding): weekly reward claims, milestone unlocks, points-store purchases/inventory, draw entries, reward fulfilment (address, status).
- All points, streaks, unlocks and draw entries awarded server-side only; streak counts only verified non-test attempts; one prize per user per cycle; phone verification before physical claims.
- Subscription multipliers (Pro 1.5x, Pro+ 2x, annual forgiveness) enforced in the point-award RPC, not the client.
- Push: reuse existing `push_subscriptions` + `send-push-notification`; scheduled evening streak-risk sweep.
- Admin: reward claim queue, shipment status, prize-budget cap as % of monthly subscription revenue.
- Pricing page copy reframed to "Free users play. Pro users progress faster."
