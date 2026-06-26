# Plan: JEEnie Roast (from scratch) + Analytics single-screen redesign

## Part 1 — JEEnie Roast: rebuild from scratch (CRAZY AF mode)

### Root cause of current breakage
The text in your screenshot ("Itna lamba question 800 chars max") is not a roast — it's the JEEnie edge function's input rejection. The roast prompt the client sends (~1200 chars of rules + bucket + context) exceeds the `MAX_INPUT_CHARS = 800` cap, so every roast call gets bounced. That's why "ab worst" — the cap was added recently for anti-spam and silently killed roasts.

### New architecture (server-owned, client-thin)

**Client → server payload becomes tiny:**
```json
{ "mode": "roast", "topic": "Kinetic Theory of Gases", "accuracy": 21, "nonce": "ab12" }
```
No more giant prompt over the wire. No more 800-char wall.

**Server (jeenie edge function + `_shared/jeeniePrompt.ts`):**

1. New `mode === "roast"` branch that bypasses `MAX_INPUT_CHARS`, disables history, disables cache, sets `temperature: 1.1`, `presence_penalty: 0.7`, `frequency_penalty: 0.5`, output cap ~100 tokens.
2. New `buildRoastPrompt({topic, accuracy, persona})` with:
   - **Persona roulette** — server randomly picks one per call (Mix mode you chose):
     - `bada_bhai` — savage older-brother energy, Bollywood/cricket jabs
     - `brainrot` — Gen-Z chaos: "it's giving DNF", "💀", "ratio + L + topic didn't even want you", "skibidi physics"
     - `desi_aunty` — passive-aggressive "beta, padosi ka beta to AIR 50 le aaya" energy
     - `sarcastic_prof` — deadpan academic burn: "your understanding of entropy is itself maximum entropy"
     - `meme_lord` — pure meme references: Pushpa, Binod, Rasode mein kaun tha, "ye bik gayi hai gormint", Tauba Tauba, "what's up brother"
   - **Topic-aware hook bank** — small dictionary mapping common JEE topics to concept keywords (Thermodynamics→entropy/heat-death; Rotational→torque/moment-of-inertia; Organic→SN1/SN2/Markovnikov; Calculus→limits/integration-by-parts; Electrostatics→Gauss/flux; Optics→Snell/mirror-formula; Kinetic Theory→rms-velocity/mean-free-path; etc.). Model is told to use at least one keyword from the topic's bucket so roasts feel *specific*, not generic.
   - **Accuracy buckets with few-shot examples** (this is what made the old version land):
     - BRUTAL (<20%): 2 example roasts shown in prompt
     - HEAVY (20–39%): 2 examples
     - MEDIUM (40–59%): 2 examples
     - LIGHT (60–79%): 2 examples
     - CHEEKY (80+%): 2 examples
   - **Hard format rules:** ONE line, ≤180 chars, no greeting/labels/markdown/quotes, must end with a punchline. Reject and regenerate if violated.

3. **Anti-repeat:** server accepts an optional `excludeRoasts: string[]` (last 3 roasts the user saw). Prompt tells the model: "do not echo any of these lines or their punchline structure."

### Client (`RoastMemeCard.tsx`)
- Strip the massive inline prompt. Just send `{mode, topic, accuracy, excludeRoasts}`.
- Keep last 3 roasts per user in `localStorage`, pass as `excludeRoasts`.
- Expand offline fallback bank from 4 generic lines to ~30 lines (5 personas × ~6 lines), still keyed by bucket.
- Keep `sanitizeRoast` + leading-topic stripper.
- Optional micro-polish: tiny "persona tag" pill ("🧞‍♂️ bada bhai mode", "💀 brainrot mode") so user feels the variety. Small, dismissible — won't add clutter.

### What "crazy AF" actually means in the prompt
- Allow current internet slang and meme references explicitly, not just Bollywood.
- Permit emojis at end (not start), max 2.
- Reward wordplay tied to the topic ("tera entropy infinite hai, knowledge zero"), penalize generic burns ("you're bad at this").
- Punchline must twist — setup builds expectation, payoff subverts it.

---

## Part 2 — Analytics page: single-screen, zero scroll

### Current problems
- 5 tabs (Overview / SWOT / Weekly / Monthly / Detailed), 855 lines, every tab scrolls.
- Weekly + Monthly + Detailed largely duplicate each other (same accuracy chart + subject bars, different windows).
- Overview is bloated: 5 KPIs + 7d chart + subject chart + roast + weakness list, all stacked vertically.
- SWOT — the most unique view — is buried as tab #2.

### Proposed structure (3 tabs, each fits one viewport)

```
┌─ Header ───────────────────────────────────────────────┐
│ [Overview] [SWOT] [Trends]      Range: 7d · 30d · All  │
├────────────────────────────────────────────────────────┤
│ KPI strip — 5 tiles in one row                         │
│ Accuracy · Questions · Streak · Rank · JEEnie pts      │
├──────────────────────────┬─────────────────────────────┤
│ Main chart (60% width)   │ Right rail (40%)            │
│  Overview → 7d combo     │  Top 1 strength             │
│  SWOT     → quadrant     │  Top 1 weakness + Fix CTA   │
│  Trends   → line + bars  │  JEEnie Roast (compact)     │
└──────────────────────────┴─────────────────────────────┘
```

### What stays (all your must-haves, confirmed)
- KPI strip (Accuracy / Qs / Streak / Rank / JEEnie pts) — single row, equal width.
- 7-day accuracy + questions combo chart (lives on Overview).
- SWOT quadrant — promoted, gets its own tab as the centerpiece.
- JEEnie Roast — kept in the right rail in compact form (smaller, no extra heading).

### What gets cut / merged
- Weekly tab → merged into **Trends** with 7d/30d/All toggle.
- Monthly tab → merged into Trends.
- Detailed tab → moved behind a "View all topics →" link that opens a drawer (data preserved, screen reclaimed).
- Long weakness list on Overview → show top 1 only with "See all (N)" link to same drawer.
- Duplicate subject-performance bars across tabs → one canonical version on Trends.

### Zero-scroll mechanics
- Outer shell already uses `flex flex-col overflow-hidden` — replace inner `overflow-y-auto` with a `flex-1 min-h-0 grid` that adapts to viewport height.
- Chart heights clamped to viewport: `h-[clamp(160px,28vh,240px)]`.
- Card padding tightened (`p-3`), `gap-3` grid replaces `space-y-4` stacks.
- Mobile: right rail collapses *below* chart, but each tile is `h-[20vh]` so total ≤ 100vh − header − bottom nav.
- Tabs become horizontal swipe (shadcn Tabs + simple touch handler) — your preferred right/left swipe nav.

---

## Files touched
- `supabase/functions/jeenie/index.ts` — add roast mode branch, bypass char cap, tune sampling, accept `excludeRoasts`.
- `supabase/functions/_shared/jeeniePrompt.ts` — add `buildRoastPrompt()` with personas, topic hooks, few-shot examples.
- `src/components/RoastMemeCard.tsx` — thin payload, localStorage anti-repeat, expanded fallback bank, optional persona pill.
- `src/lib/roastUtils.ts` — extend sanitizer for new persona output.
- `src/pages/AnalyticsPage.tsx` — restructure to 3 tabs + grid + drawer, drop Weekly/Monthly/Detailed.
- No DB / RLS changes. No new dependencies.

## Out of scope
- Roast image generation (still uses existing ShareCardDialog).
- New analytics data sources — only restructuring what's already computed.
