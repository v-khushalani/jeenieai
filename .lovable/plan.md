## 1. AI Doubt Solver — show "Upgrade" instead of generic error when quota exhausts

**Root cause**: The `jeenie` edge function returns HTTP `429` with a friendly Hinglish quota message in the body. Supabase JS client treats any non-2xx as `FunctionsHttpError` and discards the body, so `aiAPI.askJeenie` surfaces a generic `"Edge Function returned a non-2xx status code"` — which `AIDoubtSolver` then maps to *"Oho! JEEnie thoda confuse ho gaya"*. The actual quota message + upgrade CTA never reaches the user.

**Fix**:
- `supabase/functions/jeenie/index.ts`: return quota / rate-limit responses with `status: 200` and add a structured payload:
  ```json
  { "response": "<hinglish msg>", "quota_exhausted": true, "limit_type": "daily" | "monthly" | "interval", "tier": "free|pro|pro_plus", "upgrade_to": "pro" | "pro_plus" | null }
  ```
- `src/components/AIDoubtSolver.tsx`: when `data.quota_exhausted` is true, render the message as a normal JEEnie chat bubble (no error toast) and show an inline **"Upgrade to Pro / Pro+"** button that opens the existing `PricingModal` with the right target tier. Free → Pro, Pro → Pro+. For `interval` (anti-spam) just show the message, no upgrade button.
- Keep the message format consistent (already tier-aware in the edge function — Free sees Pro+Pro+ pitch, Pro sees Pro+ pitch, Pro+ sees "kal wapas aa").

## 2. Leaderboard — clarify ranking basis (no code change)

The ranking is **net JEEnie points (`profiles.total_points`) descending**, with **total questions attempted** as a tiebreaker. Source: `get_leaderboard_with_stats` RPC (migration `20260625025841`):
```
ORDER BY total_points DESC, total_questions DESC
```
`total_points` is kept in sync via the `trg_sync_profile_total_points` trigger which sums all `points_log` rows (positives + negatives) for that user. So once issue #3 is fixed, the leaderboard will correctly reflect net scores.

## 3. JEEnie points — currently NOT subtracting on wrong answers

**Root cause**: `src/pages/PracticePage.tsx` (line ~457) calls the RPC with:
```ts
p_points_delta: Math.max(0, pointsDelta)
```
This strips every negative delta to `0` *before* the server can log it. The updated `update_practice_stats` RPC (migration `20260626022406`) already handles negatives correctly — it inserts a `wrong_answer` row in `points_log` when the delta is negative — but the client never sends them.

**Fix**:
- `src/pages/PracticePage.tsx`: pass the raw signed `pointsDelta` to `update_practice_stats` (remove the `Math.max(0, …)` clamp). Difficulty deltas already defined: Easy −15, Medium −10, Hard −5 on wrong.
- `updatePracticeStatsFallback` (offline path) already uses `Math.max(0, prevPoints + pointsDelta)` to keep `total_points` non-negative for the optimistic UI — leave that floor in place so the displayed total never goes below 0, but the server-side `points_log` will keep the true signed history.
- Verify by attempting a wrong question: `points_log` gets a negative row, the trigger updates `profiles.total_points`, and the leaderboard reflects the deduction.

## Files touched
- `supabase/functions/jeenie/index.ts` — change three 429 responses to 200 + `quota_exhausted` flag with `upgrade_to`.
- `src/components/AIDoubtSolver.tsx` — render quota messages as chat bubbles + inline upgrade CTA.
- `src/pages/PracticePage.tsx` — stop clamping the signed point delta sent to RPC.

No DB migration needed (the negative-logging RPC is already deployed).
