## Goal
AI Planner ko **Coach-first** bana do. Aaj ki mission + percentile prediction + nudge upar, Full Roadmap neeche collapsible. `/mission` ka content Planner mein migrate, MissionHome retire.

## Current vs Target

```text
CURRENT                              TARGET (/ai-planner)
────────────────────                 ─────────────────────────────
[Mentor Next Step card]      →       [Aaj ki Mission — Coach]
[Days/Accuracy/Coverage/Today]       ├─ percentile on-track vs off-track
[Roadmap | This Week | Insights]     ├─ current mission block (Start button)
[Physics roadmap: 0/47 chapters]     ├─ streak pill + nudge banner
[Chapter ladder...]                  └─ "All blocks" expand
                                     [Days/Accuracy/Coverage/Today]  (kept)
                                     [Roadmap | This Week | Insights] (kept)
                                     [Full Roadmap — collapsed by default]
```

## Changes

**1. `src/components/AIStudyPlanner.tsx`**
- Delete the "Mentor Next Step" card block (~lines 630-680).
- Insert new `<CoachMissionPanel />` at top: invokes `generate-daily-mission` (auto-create if none for today) + `compute-coach-signal` in parallel. Renders:
  - Percentile: `on_track_percentile` big, `off_track_percentile` smaller with delta + trend arrow
  - Next pending mission block → primary "Start" button routes to block's target (practice/revision/test)
  - Streak chip (`signal.streak.current`) + `nudge.message`
  - "See all blocks" → expands full mission block list (reuse markup from MissionHome lines ~409-460)
- Wrap the existing Roadmap/This Week/Insights `<Tabs>` in a `<details>` "Full Roadmap" (default open on desktop, collapsed on mobile) — content unchanged.

**2. `src/pages/MissionHome.tsx` → retire**
- In `src/App.tsx`, change `/mission` route to `<Navigate to="/ai-planner" replace />`.
- Delete `MissionHome.tsx`.
- Update any `navigate('/mission')` / `<Link to="/mission">` references (Header, MobileNavigation, dashboard cards) to point to `/ai-planner`.
- Preserve the one-time onboarding flow (prep_mode + daily_study_minutes prompt from MissionHome lines ~500-570) → move it into `CoachMissionPanel` as a modal that shows if `profile.prep_mode` is null.

**3. Pro/Pro+ gating**
- `AIStudyPlannerPage.tsx` already wraps in `<PremiumGate>`? Check — if not, wrap. Confirm route in `App.tsx` uses `<ProtectedRoute>` + tier check (pro / pro_plus only, free → upgrade CTA).

**4. Cleanup**
- Remove unused imports in AIStudyPlanner after Mentor card removal.
- No DB/edge-function changes — `generate-daily-mission` and `compute-coach-signal` already exist and stay as-is.

## Files touched
- `src/components/AIStudyPlanner.tsx` (edit — remove Mentor card, add CoachMissionPanel, wrap Roadmap in collapsible)
- `src/components/planner/CoachMissionPanel.tsx` (new — extracted from MissionHome)
- `src/pages/MissionHome.tsx` (delete)
- `src/App.tsx` (redirect `/mission` → `/ai-planner`)
- `src/components/Header.tsx`, `src/components/mobile/MobileNavigation.tsx`, any dashboard cards linking to `/mission` (repoint)
- `src/pages/AIStudyPlannerPage.tsx` (confirm Pro/Pro+ gate)

## Out of scope
- No changes to `badges`, `generate-daily-mission`, `compute-coach-signal`, or DB schema.
- Roadmap ladder logic unchanged — only its container becomes collapsible.
