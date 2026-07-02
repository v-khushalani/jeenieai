
# Plan: Yearbook rebuild, badge sharing, feature-flag sync

## 1. Rebuild WrappedPage (Yearbook) from scratch — mobile-first

Current `src/pages/WrappedPage.tsx` is a cramped desktop-first collage. Replace with a **story-mode** experience modeled on Spotify Wrapped / BeReal recap:

**Structure**
- Full-viewport vertical "stories" (`h-[100dvh]`, swipe/tap through). Each slide = one stat with hero typography.
- Progress bar on top (like Instagram stories), tap-left / tap-right to move, swipe up to share, `Esc`/back button exits.
- Slides (in order):
  1. Cover — "Your JEE 2026 Yearbook" with name + avatar, animated gradient.
  2. Streak — biggest streak, flame animation.
  3. Questions solved — big number counter.
  4. Strongest chapter — mastery %, subject color.
  5. Weakest chapter — with "let's fix this" CTA to practice.
  6. Rank climb — rank delta over time.
  7. Badges earned — grid.
  8. Personality card ("The Night Owl", "The Sprinter" — derived from behavior).
  9. Final share card — one tap to generate + share via existing `ShareCardDialog`.

**Mobile-first specifics**
- `100dvh` (not `vh`), `env(safe-area-inset-*)`, tap targets ≥44px.
- Auto-advance after 6s per slide with pause-on-hold.
- Uses framer-motion for slide transitions + counter animations.
- Palette: deep midnight → magenta gradient per slide, not the current pastel.

**Desktop**: same story frame, centered `max-w-md`, arrow keys for nav.

## 2. Share option after every badge earned

**Where**: `src/components/gamification/BadgesShowcase.tsx` + wherever a badge unlock toast fires (find via `rg "badge.*earn|newBadge"`).

**Mechanism** — most rewarding = frictionless + social proof:
- On unlock: full-screen celebration modal (confetti + badge art scaling in) with primary CTA **"Share & earn 50 XP"** and secondary "Later".
- Share generates a square card via existing `generateShareCard` (extend `ShareCardOpts` with a `badge` variant showing badge art + tagline "I just earned {badge} on JEEnie 🧞‍♂️" + user's referral QR).
- Uses `navigator.share` on mobile (native sheet → WhatsApp/IG story/Snap), falls back to download + copy-to-clipboard on desktop.
- Reward: award +50 XP on first share of each badge (tracked in a new `badge_shares` table or as a boolean column on `user_badges.shared_at`), so the reward is real but non-exploitable.
- Also add a persistent **Share** icon on every earned badge in the showcase grid, so users can re-share later.

## 3. Feature flag registry sync

Audit shows every `useFeatureFlag(...)` key in the codebase is already in `FEATURE_FLAG_REGISTRY`. Nothing missing among *user-facing* flags.

**Additions proposed** for features that currently ship un-gated but deserve a kill-switch:
- `virtual_lab` — Pro+ virtual lab simulations (`VirtualLab.tsx`).
- `ai_study_planner_v2` — planner already gated by `study_planner`, skip.
- `group_tests` already present.
- `wrapped_yearbook` — new flag for the rebuilt yearbook page (so we can dark-launch it).
- `badge_share_reward` — flag for the XP-on-share mechanic in #2.
- `pdf_extractor` (admin) — skip, admin surfaces don't need flags.
- `jeenie_voice` (text-to-speech / voice-to-text) — new flag if the mic button is user-visible.

Add these to `src/config/featureFlags.ts` and wire the gates at their entry points.

## Technical section

- New file: none for yearbook (rewrite `WrappedPage.tsx`). Extract per-slide components into `src/components/wrapped/slides/*.tsx` for readability.
- Extend `src/lib/shareCard.ts` with a `badge` variant (badge icon + name + QR).
- New migration: add `shared_at timestamptz` to `user_badges` (or create `badge_shares` if the table doesn't exist — verify first). Include GRANTs.
- Extend `pointsService` with `awardBadgeShareBonus(userId, badgeId)` idempotent by `shared_at IS NULL`.
- Update `FEATURE_FLAG_REGISTRY` with the 3 new flags above and gate: `WrappedPage` behind `wrapped_yearbook`, `VirtualLab` route behind `virtual_lab`, badge share modal behind `badge_share_reward`.
- Verify with Playwright at 390×674: story nav, badge unlock modal, share sheet, feature-flag toggle in admin.

## Open question

For badge sharing: OK with **+50 XP per first-time share of a badge** as the incentive, or prefer something bigger (streak-freeze token / entry into a monthly draw)?
