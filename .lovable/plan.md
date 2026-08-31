# Planner 4.0 — Bento Redesign (Cuberto-inspired)

Goal: planner should feel like a game board, not a document. One glance = "aaj kya karna hai", one tap = start. Har tile live data se juda hua, koi dead end nahi.

Locked taste (from your picks):
- Colors: existing JEEnie brand tokens only (navy `--primary`, amber points, emerald done, orange streak). No new palette.
- Type: Saira (already the app font) — heavy weights for numbers/labels, normal for body.
- Structure: Bento grid.

## What's wrong today

The planner stacks too many full-width blocks in one scroll: HUD row, contract strip, coach line, mission title row, combo bar, active card, chain dots, done-list, reward vault, teaser, log-class chip, plus a separate "My Journey" ladder. Everything competes; nothing leads.

## New structure

```text
┌──────────────────────────────────────────┐
│  HERO TILE (2x2) — Aaj ka challenge      │
│  mascot line + big title + timer + START │
├───────────────┬──────────────────────────┤
│ STREAK tile   │ POINTS tile              │
├───────────────┼──────────────────────────┤
│ CHAIN tile    │ COMBO tile               │
│ (dots+n/total)│ (x1..x5 meter)           │
├───────────────┴──────────────────────────┤
│ VAULT tile (wide, locked/unlocked)       │
└──────────────────────────────────────────┘
```

- Bento grid: 2 columns on mobile, 4 on desktop; hero tile spans full width. Cuberto feel = big radii, generous padding, one bold number per tile, soft motion.
- Only the hero tile has a CTA. Everything else is a status tile that expands on tap (sheet), so the surface stays calm.
- Secondary depth lives behind **tabs at the top of the planner**: `Aaj` (bento board) · `Journey` (mastery ladder / roadmap) · `Inaam` (vault + contract + rewards link). Swipeable on touch, tabs on desktop. Nothing gets deleted — it moves inside a tab.

## Interaction

- Tile entry: staggered fade+rise; hero tile has a subtle magnetic hover/press scale (Cuberto-style), reduced-motion respected.
- Hero card swipe: swipe left = "next step preview" (locked/teaser), swipe right = details sheet.
- Completing a step: tile flips to done state, points counter animates up, chain dot fills, combo meter pulses — all driven by the existing realtime mission subscription so it updates while the student practices.
- Empty/first-time state: single tile "Chalo shuru karein" with the 2-question setup, no wall of text.

## Backend wiring (no dead ends)

Every tile is bound to what already exists, and each binding gets verified end to end:

- Hero tile → `daily_missions` row + `generate-daily-mission` edge function; START navigates to the block's `action_href`.
- Progress/auto-tick → existing realtime UPDATE channel on `daily_missions` + `bump_mission_progress_by_chapter`.
- Points → `award_mission_points` RPC and `profiles.total_points`.
- Streak → `compute-coach-signal`.
- Combo → existing combo hook.
- Contract → contract strip data source.
- Vault / rewards → rewards tables and the `/rewards` page.
- Journey tab → roadmap/ladder data, grade-filtered.
- Audit pass: every tile, button, tab and sheet must lead to a real route or open real data; anything without a destination is either wired or removed. Loading and error states on each tile instead of blank space.

## Verification

- Sign in as the pro-plus test account, walk `/ai-planner`: start a challenge, solve questions, confirm the hero tile auto-ticks live, points animate, chain fills, vault unlocks at 100%.
- Check all three tabs, mobile (820px and 390px) and desktop, light and dark.
- Extend the Playwright planner spec to cover tab switching and tile → destination links, and run the suite.

## Technical notes

- Rewrite `src/components/AIStudyPlanner.tsx` as the tabbed shell; new `src/components/planner/BentoBoard.tsx` plus small tile components (`HeroChallengeTile`, `StatTile`, `ChainTile`, `ComboTile`, `VaultTile`).
- Reuse `MissionChain`'s data layer — extract its fetching/awarding logic into a `usePlannerMission` hook so tiles share one source of truth, with no logic changes to the queries or RPCs themselves.
- Keep `MissionCard`, `ChainDots`, `ComboBar`, `ContractStrip`, `RewardVault`, `JeenieCoachLine` as internals of the new tiles where they fit; retire what the bento replaces.
- Styling only via existing semantic tokens in `src/index.css`; add planner-specific tile radius/shadow tokens there if needed.
