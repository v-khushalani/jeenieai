
## Four targeted fixes in JEEnie

### 1. Same question = same instant answer (caching bug)

`src/services/api/modules/ai.ts` caches every `askJeenie` response by `contextPrompt` for 24 h. That's why repeats return instantly with identical text and no loader.

**Fix:** Stop caching JEEnie doubt-solver calls entirely. Conversational tutoring should never be cached — context, mode and follow-ups all vary. Remove the `cache.get`/`cache.set` block in `askJeenie` (keep caching for study-plan, TTS, insights — those are legit). Cost impact is negligible because our token budgets are already tight.

### 2. Bullet points on every line

Two layers are forcing bullets:

- **Server prompt** (`supabase/functions/_shared/jeeniePrompt.ts`, `FORMATTING`) says "Use ### headings + bullets" as a hard rule, and `TEACHING.quick` says "4–8 bullets".
- **Client formatter** (`cleanAndFormatJeenieText` in `AIDoubtSolver.tsx`) auto-splits any `**Title**:` or `emoji **Title**:` mid-sentence into a new bullet — so even prose gets shredded into bullets.

**Fix:**
- Rewrite `FORMATTING` to *allow* bullets when listing 3+ items, otherwise prefer short prose. Drop the "Max 2 sentences per bullet" line. Drop the "open with Hello Puttar" rule for short/follow-up replies (greeting already handled by intent layer).
- Change `TEACHING.quick` to "2–4 short sentences OR up to 5 bullets if it's truly a list."
- In `cleanAndFormatJeenieText`, remove the two regex passes that synthesize bullets out of `**Title**:` patterns. Keep markdown→HTML rendering, just don't manufacture list items.

### 3. "hello" triggers Explain More / Numericals / etc.

Chip row renders whenever there's any user message + the latest message is assistant. A casual "hello" still shows academic follow-up chips.

**Fix:** Add a tiny greeting / chit-chat detector in `AIDoubtSolver.tsx` (regex on the latest user message: `^(hi|hello|hey|hii+|namaste|salaam|yo|sup|thanks|thank you|ok|okay|cool|nice|good|great|hmm)\b`, length < 25 chars, no `?`/`=`/digit). When true, hide `AIDoubtActionChips`. Also tell JEEnie via prompt: for greetings/chit-chat, reply in 1 short line, no headings/bullets/chips-bait.

### 4. Pro user clicking locked Pro+ chip sees "Upgrade to Pro"

`AIDoubtActionChips.onLocked` always opens `PricingModal` with `limitType="ai_doubt_locked"`. The modal only knows Pro pricing and labels everything "Paid". A Pro user is told to "upgrade to Pro" — which they already are.

**Fix:**
- Add a `requiredTier?: 'pro' | 'pro_plus'` prop to `PricingModal`. When `pro_plus`, swap the comparison table to Pro vs Pro+, fetch the Pro+ plan via `useSubscriptionPlans`, change copy ("Unlock with JEEnie Pro+", "You already have Pro — Pro+ adds PYQs, Smart Notes…"), and link CTA to `/subscription-plans` with a `?highlight=pro_plus` hash so the plans page can scroll/highlight (best-effort; harmless if unused).
- In `AIDoubtSolver.tsx`, plumb the clicked chip's `minTier` into `onLocked` and pass it into `<PricingModal requiredTier={…} />`.

### Files touched

- `src/services/api/modules/ai.ts` — remove JEEnie response caching
- `supabase/functions/_shared/jeeniePrompt.ts` — relax FORMATTING + TEACHING.quick, add greeting guidance
- `src/components/AIDoubtSolver.tsx` — drop bullet-synthesis regexes, greeting detector hides chips, pass `requiredTier` to modal
- `src/components/AIDoubtActionChips.tsx` — pass `minTier` through `onLocked`
- `src/components/PricingModal.tsx` — `requiredTier` prop with Pro+ variant copy + plan lookup

No DB changes, no edge-function deployment beyond the prompt file.

### Verification

After build I'll drive the preview with Playwright using the injected session: open the doubt solver, send the same question twice (expect loader + different timing both times), send "hello" (expect no chip row), then click the **PYQs** chip as a Pro user (expect a Pro+ modal, not a Pro one). Screenshots for each.
