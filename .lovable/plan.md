# Ship chips + analytics + margin guardrail — and make JEEnie tier-blind in conversation

Same scope as before, **plus one important behavior change**: JEEnie itself must never mention tiers, quotas, plans, upgrades, or pricing in its replies. Those concerns belong to the UI (chips, modals, paywalls), not the AI's voice. A Free user asking a doubt should get the same bada-bhai answer with no "upgrade to Pro+" line.

---

## 0. Tier-blindness rule (NEW, threads through every layer)

### `supabase/functions/_shared/jeeniePrompt.ts`
Rewrite the `ENTITLEMENTS` layer so it instructs **length** but never names the tier or any plan word:

```text
# Before (leaks tier)
Tier: FREE. Cap output ~120 words...
Tier: PRO. Cap output ~250 words...
Tier: PRO+. No hard cap...

# After (length only, no tier identity)
Keep reply under ~120 words. Single shot — no follow-up assumed.
Keep reply under ~250 words.
No hard cap; prefer concise.
```

Add an explicit forbidden-topics line to `PERSONALITY`:

```text
NEVER mention: "free", "pro", "pro plus", "premium", "subscription",
"plan", "upgrade", "paid", "trial", "quota", "limit", "credits", pricing,
or what the user "can/can't" access. If the user asks about plans/pricing/upgrade,
reply once: "Bhai, woh sab app ke andar mil jayega — main toh sirf padhai mein
help karne ke liye hoon. Ab bata kya doubt hai? 💪"
```

### `supabase/functions/jeenie/index.ts` — server-side safety net
After the model returns, run a tiny regex scrub on the output. If any forbidden token slips through (`/\b(pro\+?|premium|subscription|upgrade|paid plan|free tier|quota)\b/i`), replace that sentence with the canned redirect line above. Log the event to `ai_request_log.fallback_used = 'tier_scrub'` so we can monitor false positives.

### `src/components/AIDoubtSolver.tsx`
- Remove any client-side strings that pass tier names into the prompt or pre/post-pend tier mentions.
- The "Auto-picked: Quick Explain · change" hint stays — that's a mode name, not a tier.

---

## 1. Action chips — `src/components/AIDoubtActionChips.tsx` (new)

Renders **after** the first assistant message in the thread.

```text
[ Explain More ] [ Numericals ] [ Exam Answer ] [ PYQs 🔒 ] [ Smart Notes 🔒 ]
```

- Locked chips show 🔒 and open `PricingModal` on tap — **the UI** does the upselling, not JEEnie.
- Free → component hidden entirely (single-shot stays enforced; no chip = no follow-up).
- Pro → Explain More / Numericals / Exam Answer unlocked. PYQs + Smart Notes locked.
- Pro+ → all unlocked. Smart Notes saves to `study_notes` tagged `from:jeenie`.
- Mobile: `overflow-x-auto snap-x snap-mandatory`, 44 px touch target.
- Click → follow-up request with `{ mode, modeSource: 'manual_chip' }`.

## 2. `AIDoubtSolver.tsx`
- Remove the mode dropdown.
- Mount `<AIDoubtActionChips />` under the latest assistant turn.
- Tiny "Auto: **Quick** · change" affordance for one-tap mode correction (logs as `manual_chip`).

## 3. `src/utils/aiDoubtTelemetry.ts` (new, tiny)
Stamps `modeSource` + measures end-to-end latency. No PII.

## 4. `supabase/functions/jeenie/index.ts`
- Accept `modeSource` in body → log in `ai_request_log`.
- **Hard ceiling: `maxTokens = min(computeMaxTokens(...), 1200)` for all tiers.** Stops any single doubt from burning >₹0.02. This is the margin guardrail.
- Apply the tier-scrub from §0.
- Keep `JEENIE_PRO_MODEL_ENABLED` default `false`.

## 5. `src/pages/AnalyticsPage.tsx` — admin-only "JEEnie cost" panel
Reads `ai_request_log` (gated by `has_role(uid, 'admin')`):
- Spend last 7 / 30 days (₹)
- Cost per tier · per mode
- p50 / p95 latency
- Fallback rate (Gateway → Gemini direct → OpenAI)
- **Tier-scrub rate** — if >2% of replies trip the regex, the prompt needs tuning
- **Margin tracker**: avg cost per active Pro user vs ₹100 effective/mo (yearly), Pro+ vs ₹167. Red badge below 60% margin.

## 6. `src/services/api/types.ts`
Add `modeSource?: 'auto' | 'manual_chip' | 'manual_dropdown'` to `JeenieRequest`.

---

## Quick margin recap against your real pricing (₹149 Pro, ₹249 Pro+)

Yearly buyers effectively pay ₹100 / ₹167 per month. Worst case (user maxes quota every day, Flash only, refactored prompt):

| Tier | Doubts/mo | AI cost | Margin on yearly |
|---|---|---|---|
| Pro | 900 | ~₹12 | **86%** ✅ |
| Pro+ | 3,000 | ~₹42 | **73%** ✅ |
| Pro+ image-heavy | 3,000 | ~₹54 | **66%** ✅ |
| Pro+ with Pro-model flag ON | 3,000 | ~₹120 | **26%** ⚠️ |

Conclusion: safe at current pricing. The only loss-risk is enabling Gemini Pro routing for Pro+ deep/master — keep that flag off in prod for now, the 1200-token ceiling is the safety net.

---

## Files touched

- `supabase/functions/_shared/jeeniePrompt.ts` (tier-blind rewrite of ENTITLEMENTS + PERSONALITY)
- `supabase/functions/jeenie/index.ts` (modeSource, 1200-token ceiling, tier-scrub)
- `src/components/AIDoubtActionChips.tsx` (new)
- `src/components/AIDoubtSolver.tsx` (drop dropdown, mount chips, mode-change hint)
- `src/utils/aiDoubtTelemetry.ts` (new)
- `src/pages/AnalyticsPage.tsx` (JEEnie cost panel, admin-only)
- `src/services/api/types.ts` (`modeSource` field)

No DB migration — `ai_request_log` already exists.

## Deliberately deferred (flagged earlier, not in this PR)

Annual nudge on quota wall · 24h answer cache · daily image sub-quota · Pro-model flag with per-user cap · long-output abuse alerting. We can pick these up after one week of telemetry from the new panel.
