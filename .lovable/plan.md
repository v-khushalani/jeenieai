# Launch Pack — Android Build, Landing + Onboarding, Store Listing

Three tracks. One honest limitation up front: the Android app bundle (.aab) has to be produced and uploaded from your own machine / Play Console — no cloud tool can sign and publish it for you. What I can do is make the project 100% ready so the build is three commands, and hand you a fill-in-the-blanks checklist.

## Track A — Play Store readiness (in-app work)

- PWA manifest upgrade: proper `id`, `scope`, `display_override`, `shortcuts` (Practice, Planner, Rewards), correct 192/512/maskable icon entries (files already exist in `public/`).
- Generate a real icon set and splash asset from the JEEnie mascot/logo: adaptive icon foreground, 512x512 store icon, 1024x500 feature graphic, portrait splash. Saved under `public/store/` so you can upload straight from there.
- Capacitor: keep `ai.jeenie.app`, add splash + status-bar plugin config, safe-area handling, hardware back-button handling (Android back should navigate, not close the app).
- Add `/legal` completeness check — Play requires a public privacy policy URL; we already have `/privacy-policy`, will verify it is reachable without login and mentions data collection + deletion.
- Add an in-app "Delete my account" path (Play policy requirement for accounts) in Settings.

Build steps you run once locally (I will write them into `README.md`):

```text
git pull → bun install → bun run build
npx cap add android → npx cap sync android
npx cap open android  → Android Studio → Build → Signed Bundle (.aab)
```

## Track B — Home page: onboarding + marketing copy

Rebuild `/` as a real conversion page, then a real first-run flow.

Landing sections (in order):
1. Hero — one promise: "12 minutes a day. We decide what you study." + Start free / See how it works.
2. Why JEEnie — 3 cards: no more "what to study today", every question new (never repeated), progress you can actually see.
3. How it works — 3 steps: tell us your exam → get today's 3 challenges → solve, auto-tick, earn points.
4. Daily 12-min promise — visual of a day's board (3 tiles), honest framing: small daily wins beat weekend marathons.
5. Proof strip — question bank size, chapters, exams covered (real numbers from the DB, not invented claims).
6. Rewards teaser → streak prizes.
7. FAQ (existing schema) + final CTA.

Onboarding flow after sign-up (`/onboarding`, 4 quick screens, no typing):
exam & class → target year → prep style + daily minutes (writes `prep_mode`, `daily_study_minutes`) → first mission generated and student lands directly on their first challenge, not on an empty dashboard.
Existing users who already set `prep_mode_set_at` skip it.

## Track C — Store listing checklist + post-launch tracking

I will write `docs/play-store-checklist.md` containing:
- App name, short description (80 chars), full description (4000 chars) — written, ready to paste.
- Asset list with exact sizes and where each generated file lives.
- Data safety form answers (what we collect: email, name, study activity; no location, no ads SDK).
- Content rating questionnaire answers, target audience (13+), ads declaration, financial-features declaration for Razorpay.
- Note: keep subscriptions on the web for v1 to avoid Play billing rejection; the app links out, does not sell in-app.
- Release plan: internal testing → closed test (20 testers, 14 days, required by Google for new personal accounts) → production.

Tracking real students after launch: an admin "Launch metrics" view showing sign-ups per day, onboarding completion %, students with a mission today, missions completed, reward claims — all from existing tables (`profiles`, `daily_missions`, `reward_claims`, `question_attempts`). No new tracking SDK.

## Order of work

1. Track B (landing + onboarding) — this is what students see, biggest impact.
2. Track A (manifest, icons, splash, Capacitor, account deletion).
3. Track C (checklist doc + admin launch metrics).

## Technical notes

- New: `src/pages/OnboardingPage.tsx`, `src/components/landing/*` sections, `docs/play-store-checklist.md`, `public/store/*` assets.
- Edited: `index.html` (no change to title/desc, only PWA bits), `public/manifest.json`, `capacitor.config.ts`, `src/App.tsx` (onboarding route + redirect), `src/pages/Settings.tsx` (account deletion), `README.md` (build steps).
- Account deletion uses the existing `admin-delete-user` edge function pattern, restricted to the caller's own id.
- All styling stays on existing semantic tokens; no new palette.
