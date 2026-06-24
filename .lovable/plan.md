# JEEnie AI Doubt Solver — Architecture Refactor + Cost Optimization

## Goals (per your direction)

1. Compress the prompt to 250–400 tokens without losing personality or quality.
2. Auto-pick the response style (Quick / Deep / Exam / Steps / Master) from the question itself. Manual chips only override.
3. "Bada-bhai" Hinglish personality is **identical across Free / Pro / Pro+** — it's brand, not a paywall.
4. Adaptive response length — short questions get short answers.
5. Progressive disclosure — answer first, follow-up action chips after.
6. Replace mode dropdown with horizontal action chips (mobile-first).
7. Stay on Gemini 2.5 Flash for all tiers. Pro model upgrade is config-gated for later.
8. Per-request telemetry: tokens, latency, model, mode, cost — to drive future pricing.
9. Refactor the giant prompt into 4 modular layers.

Tier feature gating (image, voice, quota, history, PYQ) stays as already discussed and is **not** changed in this plan — only the AI architecture is refactored.

---

## 1. Modular prompt layers

Replace the single 480-token `SYSTEM_PROMPT` + 180-token client-injected `TONE_RULES` with **4 composable pieces** in a new shared module `supabase/functions/_shared/jeeniePrompt.ts`.

```text
┌──────────────────────────────────────────────┐
│  PERSONALITY  (always on, ~80 tokens)        │  ← brand voice
├──────────────────────────────────────────────┤
│  FORMATTING   (always on, ~90 tokens)        │  ← bullets/headings/emoji
├──────────────────────────────────────────────┤
│  TEACHING     (mode-specific, ~40-80 tokens) │  ← depth & structure
├──────────────────────────────────────────────┤
│  ENTITLEMENTS (tier-specific, ~20-40 tokens) │  ← max length, PYQ on/off
└──────────────────────────────────────────────┘
```

### PERSONALITY (constant, all tiers)
```
You are JEEnie — JEE/NEET student's bada-bhai mentor.
Voice: Natural Hinglish (Roman script). Address "Puttar/bhai/yaar".
Warm, witty, smart-senior vibe. Bollywood/cricket/meme refs welcome.
NEVER pure English. NEVER Devanagari. NEVER "Dear student" examiner tone.
```

### FORMATTING (constant, all tiers)
```
Every reply:
- Open "**Hello Puttar!** 🧞‍♂️" (skip on follow-ups)
- Use ### headings + "- <emoji> **Key:** content" bullets
- Bold every term/number/formula with **...**
- Max 2 sentences per bullet. No 3+ sentence paragraphs.
- End with 1-line takeaway + emoji.
Math symbols allowed: α β γ θ λ μ π Δ Σ ∫ → ⇒ ≈ ≤ ≥
```

### TEACHING blocks (one chosen per request)
```
quick: 4–8 bullets. 1–2 headings. Concept + 1 example.
steps: ### Given / ### Formula / ### Solution (numbered) / ### Answer
deep:  + intuition + real-life analogy + "kyun" line after each step
exam:  + marking-scheme structure (define / derive / substitute / box answer)
master:+ link 1 relevant PYQ (year + exam) + common trap
```

### ENTITLEMENTS (server-injected per tier)
```
Free:  Cap output at ~120 words. No follow-up context.
Pro:   Cap output at ~250 words. Use up to last 4 turns.
Pro+:  No hard cap; prefer concise. Use last 6 turns. PYQ refs allowed.
```

**Total per request: 240–320 input tokens** (vs current ~1500–2000 with history). **~70% cheaper.**

Personality + Formatting strings live as constants. Final prompt = `PERSONALITY + FORMATTING + TEACHING[mode] + ENTITLEMENTS[tier]`. Brand voice stays identical because the first two blocks are unchanged across tiers.

---

## 2. Auto-mode detection

New helper `detectMode(question: string, hasImage: boolean): Mode` in `_shared/jeeniePrompt.ts`. Lightweight regex/keyword classifier — no extra LLM call:

```text
hasImage + "solve" / numbers / "="           → steps
"derive" / "prove" / "show that"             → exam
"why" / "kaise" / "samjha" / "intuition"     → deep
"previous year" / "PYQ" / "JEE 2023"         → master
short factual (<15 words, no math)           → quick
default                                       → quick
```

Client sends `{ question, mode: 'auto' | <explicit> }`. Server resolves: if `auto`, run `detectMode`; else use override. Pro+ unlocks all manual overrides; Pro gets quick/steps overrides; Free gets none (auto only). Returns `resolvedMode` in response so the UI can highlight the active chip.

---

## 3. Adaptive length

Drop fixed word counts. Replace `max_tokens: 2000` with tier-aware soft caps **plus a per-question complexity factor**:

```text
maxTokens = baseCap[tier] × complexityFactor(question)
  complexityFactor:
    short fact (<15 words, no math)       → 0.3   (~80–150 tokens)
    standard concept doubt                 → 0.6   (~250–400 tokens)
    numerical / derivation                 → 1.0   (full cap)
    multi-part / "explain everything"      → 1.0
```

Base caps: Free 400, Pro 700, Pro+ 1200. Result: 1-line questions get 1-paragraph answers, not 6 headings.

---

## 4. Progressive disclosure (action chips)

Replace the mode dropdown in `AIDoubtSolver.tsx` with a horizontal chip row that appears **after** the first answer renders:

```text
[ Explain More ]  [ Exam Answer ]  [ Numericals ]  [ Diagram ]  [ PYQs ]
```

Behavior:
- Each chip = a follow-up request with that mode injected, reusing the same thread.
- Chips locked by tier render with 🔒 and open the upgrade modal on click.
- Free tier: chips hidden entirely (single-shot enforced).
- Pro: `Explain More`, `Numericals` unlocked.
- Pro+: all chips unlocked, plus `Smart Notes` (saves to "My Weak Topics").
- Mobile: horizontal scroll, snap-to-chip, 44 px touch target.
- The existing mode dropdown is removed. Manual override still possible via the chips (a chip click = override).

---

## 5. Model strategy

- **All tiers use `google/gemini-2.5-flash` today.**
- New env-driven flag `JEENIE_PRO_MODEL_ENABLED` (default `false`). When true, Pro+ requests with `mode ∈ {deep, master}` route to `google/gemini-2.5-pro`. Ship the routing code now, leave the flag off until telemetry justifies it.
- Keep the existing OpenAI / direct-Gemini fallback chain unchanged for reliability.

---

## 6. Telemetry

New table via migration:

```sql
CREATE TABLE public.ai_request_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  tier text NOT NULL,                  -- free | pro | pro_plus
  mode text NOT NULL,                  -- quick|steps|deep|exam|master
  mode_source text NOT NULL,           -- auto | manual_chip | manual_dropdown
  model text NOT NULL,
  input_tokens int,
  output_tokens int,
  latency_ms int,
  estimated_cost_inr numeric(10,4),
  had_image boolean DEFAULT false,
  fallback_used text,                  -- null | gemini | openai
  created_at timestamptz DEFAULT now()
);
GRANT SELECT, INSERT ON public.ai_request_log TO authenticated;
GRANT ALL ON public.ai_request_log TO service_role;
ALTER TABLE public.ai_request_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read own logs" ON public.ai_request_log
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "service inserts" ON public.ai_request_log
  FOR INSERT TO service_role WITH CHECK (true);
```

Server writes one row per request from `jeenie/index.ts` finally-block. Cost computed inline using a per-model rate table.

Admin analytics page (existing `AnalyticsPage.tsx`) gets a "JEEnie cost" panel: total spend, cost per tier, cost per mode, p95 latency, fallback rate. Drives future quota decisions.

---

## 7. Cost projection (after refactor, Flash only)

Per-doubt avg with compressed prompt + adaptive length:

| Question type | Input | Output | Cost/doubt |
|---|---|---|---|
| Short factual | 280 | 120 | ₹0.005 |
| Standard concept | 350 | 350 | ₹0.011 |
| Numerical/derivation | 450 | 600 | ₹0.018 |
| With image | 600 | 400 | ₹0.015 |

**Per heavy user / month (using existing quotas 2 / 15 / 40):**
| Tier | Doubts/mo | Avg cost/doubt | Cost/user/mo |
|---|---|---|---|
| Free | 60 | ₹0.007 | **~₹0.42** |
| Pro | 450 | ₹0.012 | **~₹5.4** |
| Pro+ | 1200 | ₹0.014 | **~₹17** (Flash only) |
| Pro+ worst case if Pro-model flag on | 1200 | mix → ₹0.08 avg | **~₹95** |

Margin check (illustrative pricing, you confirm):
- Pro ₹299 → ~98% gross margin on AI
- Pro+ ₹599 → ~97% margin (Flash only) / ~84% (with Pro model on)

**Comparison to today (no refactor):** ~₹14/Pro user/mo, ~₹45/Pro+ user/mo on Flash. The refactor saves ~60–65% of AI cost across the board, mostly from prompt compression + adaptive length + history trim.

---

## 8. Implementation order (one PR each, can ship independently)

1. **`supabase/functions/_shared/jeeniePrompt.ts`** — Personality / Formatting / Teaching / Entitlements constants + `buildPrompt({ tier, mode })` + `detectMode()` + `complexityFactor()`.
2. **`supabase/functions/jeenie/index.ts`** — Replace inline `SYSTEM_PROMPT` with `buildPrompt(...)`. Accept `{ question, mode, tier, hasImage }` in body. Trim history to last 4 (Pro) / 6 (Pro+) / 0 (Free). Apply adaptive `maxTokens`. Wire `JEENIE_PRO_MODEL_ENABLED` flag. Write `ai_request_log` row. Keep fallback chain.
3. **`src/components/AIDoubtSolver.tsx`** — Remove `TONE_RULES`. Send `mode: 'auto'` by default. Remove mode dropdown; add `<ActionChips />` row that renders after first assistant message. Show `resolvedMode` indicator.
4. **`src/components/AIDoubtActionChips.tsx`** (new) — Horizontal chip row, tier-gated, mobile snap-scroll, 🔒 + upgrade modal on locked chips.
5. **Migration** — `ai_request_log` table + RLS.
6. **`src/pages/AnalyticsPage.tsx`** — Add "JEEnie cost" panel reading from `ai_request_log` (admin-only).
7. **`src/utils/aiDoubtTelemetry.ts`** — Tiny client helper to send `mode_source` + latency back so server can record where the mode came from.

Each step is independently shippable and reversible.

---

## What this plan deliberately does NOT change

- Tier quotas (2 / 15 / 40) — unchanged from prior agreement.
- Image / voice / PYQ / history retention gating — unchanged.
- Pricing page copy — only the "modes" section needs minor wording tweak when chips ship.
- Rollover / share links / weak-topics notebook — deferred, as before.

---

## Risks & mitigations

- **Prompt compression regressing quality** → Ship behind a `JEENIE_PROMPT_V2` flag; A/B against current prompt on 10% of Pro traffic for 48h; auto-rollback if `output_tokens` or user thumbs-down rate moves >15%.
- **Auto-mode picking wrong mode** → Always show "Showing as Quick Explain · [change]" link under the answer; one click switches mode and re-asks. Log mismatches for tuning the classifier.
- **Telemetry table growth** → Partition by month after 90 days; nightly aggregate into `ai_cost_daily` rollup table when row count > 1M.
