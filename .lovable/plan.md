## 1. AI Planner — background load + instant open

**Problem:** `/ai-planner` blocks on roadmap engine (reads attempts + chapters + progress across all subjects) before showing anything. On mobile that's 2-4s of spinner.

**Fix:**
- Add a lightweight `plannerCache` (in-memory + `localStorage` key `jeenie:planner:v1`) that stores the last computed `{ roadmaps, weakness, insights, computedAt }`.
- On app boot (inside `AuthContext` after user resolves), fire a **background prefetch** via `requestIdleCallback` that runs `roadmapEngine` and writes to cache. No UI shown.
- `AIStudyPlanner` reads from cache first → renders **instantly** with a subtle "Refreshing…" pill in the corner, then swaps in fresh data when the background recompute finishes.
- Cache TTL: 10 min. Invalidate on new `question_attempts` insert (already tracked) or manual pull-to-refresh.

## 2. Phone memory / prefetch strategy

Yes — worth doing, but **selectively** (mobile RAM/data is limited). Plan:

- **Prefetch on idle** (not on load) using `requestIdleCallback` after dashboard mounts:
  - Planner roadmap (point 1)
  - Analytics aggregates (weakness/strength buckets)
  - Next 20 practice questions for user's weakest chapter
- Store in a single `sessionPrefetch` module (memory) + selective `localStorage` for roadmap/analytics (survives reload).
- **Route-level code-split already exists** via `lazyWithRetry` — add `router.prefetch`-style dynamic imports on hover/tap-start of bottom nav items so the JS chunk is ready before navigation.
- Skip prefetch on `navigator.connection.saveData === true` or `effectiveType === '2g'`.

Net effect: Planner, Analytics, Practice open in <200ms after first dashboard visit.

## 3. JEEnie Roast — repetition problem

**Root causes:**
- Server prompt has a small persona pool and the fallback bank (in `RoastMemeCard.tsx`) has fixed lines like "silent cry for help" — when Gemini rate-limits or truncates, we fall through to the same 3 lines.
- `excludeRoasts` sent to the edge function only holds last 3 → recycles fast.
- Persona roulette in `supabase/functions/jeenie/index.ts` may be seeded weakly.

**Fix:**
- Expand server-side persona bank to 8 (add: cricket commentator, Bollywood villain, chai-tapri philosopher) and inject a **random seed + timestamp** into the prompt so Gemini can't return cached completions.
- Force `temperature: 1.1` and `top_p: 0.95` for roast mode only.
- Increase `excludeRoasts` window to last **10** roasts (persist in `localStorage`).
- Rewrite fallback bank in `RoastMemeCard.tsx`: 40 fresh lines, none repeating "gormint / binod / silent cry / rasode mein kaun tha" (stale memes).
- Add topic-specific hooks: pull `chapter → subject` and inject 2-3 chapter-specific facts (e.g. Thermodynamics → "entropy") so the roast feels custom, not templated.
- Add a "🎲 Change vibe" button that forces a new persona on next generation.

## 4. Overall mobile optimization pass

Focused sweep (no redesign):

- **Perceived speed:** point 1 + 2 above cover the biggest wins.
- **Skeletons everywhere:** replace remaining spinners in Planner, Analytics, Leaderboard, Badges with content-shaped skeletons.
- **Image weight:** audit `src/assets/` — convert PNG hero/badge art to WebP via `vite-imagetools` (already available).
- **Tap targets:** audit bottom-nav + action chips — enforce min 44×44px hit area.
- **Safe-area padding:** verify `env(safe-area-inset-bottom)` on `MobileNavigation` (iPhone notch users).
- **Font loading:** add `font-display: swap` if not present, preload primary weight.
- **Bundle:** check if `AIStudyPlanner`, `Analytics`, `Roast`, and admin bundles are lazy-loaded. If any admin/educator code is in the student bundle, split it.
- **Realtime:** audit for un-cleaned `supabase.channel` subscriptions (leaked channels on route change are a known mobile battery/data drain).

### Technical notes

- New files: `src/lib/plannerCache.ts`, `src/lib/prefetchManager.ts`.
- Modified: `src/components/AIStudyPlanner.tsx` (cache-first render), `src/contexts/AuthContext.tsx` (idle prefetch trigger), `src/components/RoastMemeCard.tsx` (new fallback bank, exclude window ×10), `supabase/functions/jeenie/index.ts` + `supabase/functions/_shared/jeeniePrompt.ts` (expanded personas, seed injection, temp bump), `src/components/mobile/MobileNavigation.tsx` (route prefetch on tap-start).
- No DB migrations required.
- No new secrets.

### Out of scope (ask separately if wanted)

- Full offline mode / service worker (per PWA rule — not adding unless you explicitly want offline).
- Redesigning Planner UI.
- Native Capacitor push — already exists.
