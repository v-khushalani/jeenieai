## Goal
Make `/badges` page shareable + visually exciting. Currently it's a plain grid of emoji tiles with gradient backgrounds — no share, no personality, no progress drama.

## 1. Add Share for Badges
Reuse existing `ShareCardDialog` + `generateShareCard` infrastructure (already used by Roast/Test/Streak/Wrapped).

**a. New share card type — `badge`** in `src/lib/shareCard.ts`
- Add `BadgeShareOpts { type: 'badge'; badgeName; badgeIcon; badgeDescription; category; earnedAt?; tagline }`
- Add `paintBadge(ctx, o)` painter: giant trophy/medallion treatment — large icon in a circular gradient medallion, badge name in display weight, category eyebrow, "Earned on {date}" or "Just unlocked" line, branded tagline ("Mere wallet mein ek aur badge 🏅 — tu kab aayega JEEnie pe?").
- Wire `badge` case in `generateShareCard` switch.

**b. BadgesShowcase share UX**
- Show a small `Share2` icon button in the top-right corner of every **earned** badge tile (both dynamic + table-based). Hidden on locked tiles.
- Click → opens `ShareCardDialog` with `type: 'badge'` opts + referral URL (via `ReferralService.getReferralLink(user.id)`).
- Add a top-right "Share collection" button on the page header that generates a single summary card: "{N} badges earned" + top 3 icons + tagline. (Reuse `paintWrapped` style or add a `badgeCollection` sub-mode of `paintBadge` — keep it inside one new painter for simplicity.)

## 2. Make Badges Catchy

Current look = generic gradient tile + emoji + name. Replacing it with a more game-like, premium showcase.

**a. Hero strip at top of page** (new)
- Big "Trophy Cabinet" header with user's earned count, total available, % completion ring, and the **rarest earned badge** highlighted as a "Featured" medallion with subtle float animation.
- Confetti burst (framer-motion + canvas-confetti or pure CSS) when a brand-new badge is detected (compare against `localStorage` last-seen set).

**b. Tile redesign**
- Replace flat gradient square with a **medallion**: circular emblem + ribbon banner under it with the badge name, soft inner shadow, metallic-style gradient ring (bronze / silver / gold / platinum depending on tier — derived from `points_required` buckets or category color).
- Earned tiles: subtle continuous glow pulse (animate-pulse on a blurred halo), tilt-on-hover (CSS transform).
- Locked tiles: greyscale medallion + frosted lock overlay + progress ring around the medallion (not a flat bar) showing % to unlock.
- Rarity chip ("Common / Rare / Epic / Legendary / Mythic") on each tile, derived from points threshold or category seriousness.

**c. Category sections**
- Each category gets a colored header strip with category icon, themed background tint, and a horizontal progress bar showing `earned/all` with milestone ticks instead of the plain "3/8" badge.
- Add short, fun Hinglish flavor copy per category ("Answer Streaks — ek galat answer aur sab gaya 💀", "Day Streaks — daily showup karne walon ka club", etc.).

**d. Empty / next-up callout**
- If user has 0 earned in a category, show "Closest to unlocking" card at the bottom of that category with the next badge highlighted and exactly what's needed ("4 more correct in a row → Hot Streak").

**e. Micro-interactions**
- framer-motion stagger entrance for tiles
- Hover lift + ring glow
- Tap on a tile (mobile) opens a small bottom-sheet with full description, earned date, share button — replaces the current hover tooltip which doesn't work on touch.

## Files

- `src/lib/shareCard.ts` — add `BadgeShareOpts`, `paintBadge`, switch case
- `src/components/gamification/BadgesShowcase.tsx` — full visual rebuild + share buttons + bottom-sheet detail + framer-motion + featured medallion + rarity logic
- `src/components/gamification/BadgeMedallion.tsx` *(new)* — extracted medallion tile component (earned/locked/progress variants)
- `src/components/gamification/BadgeDetailSheet.tsx` *(new)* — shadcn `Sheet` for tap-to-view + share
- `src/pages/BadgesPage.tsx` — minor: wrap in framer-motion page transition, add page-level "Share collection" CTA

No DB changes. No backend changes.

## Out of scope
- New badge definitions / new earn rules (purely a UI + share polish pass)
- Changing how badges are awarded
