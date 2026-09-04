# JEEnie Branding System + Educator Simulation Frame

Goal: har screen, har share, har animation pe JEEnie visible ho — bina clutter ke. Plus educator animations ko ek branded "JEEnie Lab" frame ke andar dikhana.

## 1. Brand kit (one source of truth)

- Ek `src/config/brand.ts` file: brand name, tagline ("Padhai ka apna bada dimaag"), mascot image, brand navy + accent tokens, share-caption templates.
- Mascot ke 3 official avatars (same character, alag mood): Idle, Cheering, Thinking — planner, rewards, loading aur empty states mein reuse honge.
- Sab jagah wahi tokens use honge, hardcoded colors nahi.

## 2. Creative branding touchpoints (high impact, low noise)

1. **Loading screen**: mascot ke saath ek rotating Hinglish line ("Chill, JEEnie soch raha hai...") — har app open pe brand recall.
2. **Empty states**: har khaali list (no missions, no doubts, no community posts) mein mascot illustration + ek witty line, plain "No data" ki jagah.
3. **Micro-mascot in header**: chhota animated mascot jo streak par blink/celebrate kare.
4. **Share cards**: har result, streak, badge aur roast ke liye branded image card (mascot + score + `jeenie.website`) — WhatsApp forward = free marketing. Ye sabse bada growth lever hai.
5. **Toasts & achievements**: JEEnie ki awaaz mein Hinglish copy, generic "Success" nahi.
6. **Certificates / test result page**: JEEnie watermark + naam, download karke share karne layak.
7. **PDF exports (question papers, notes)**: header/footer branding aur QR code.
8. **Sound/haptic signature** (optional): ek chhoti 2-note "JEEnie chime" streak aur mission complete pe.
9. **Onboarding**: mascot user ko naam se bulaye, personality pehle 30 second mein set ho jaye.
10. **404 / offline pages**: mascot ke saath mazedaar line — dead-end bhi branded.

## 3. Educator animations — "JEEnie Lab" frame

Recommendation: **content ke andar branding mat ghuso; frame lagao.** Animations third-party/teacher-made hain, unke andar overlay lagana unke layout ko todta hai aur cheap lagta hai.

Frame design:
- Bahar ek rounded navy border-card jiska top bar: chhota mascot + "JEEnie Lab" + chapter/topic naam + right side controls (fullscreen, reload, annotate).
- Neeche patli footer strip: `jeenie.website` + educator ka naam (credit) — screen recording mein bhi branding rehti hai.
- Content area ekdum clean — sirf ek halka diagonal watermark (already implemented) taaki chori na ho.
- Fullscreen mode mein bhi top bar patli hokar bani rahe, poori tarah gayab na ho.

## 4. Marketing (CMO view)

- **Distribution beats features**: har share-able moment (streak, badge, mock rank, roast) ko one-tap "Share on WhatsApp/Instagram" banao. Har share pe branded image + link.
- **Ek hi tagline everywhere** — app, Play Store, website, social bio. Consistency = recall.
- **Mascot = differentiator**: baaki apps corporate lagte hain; JEEnie ek character hai. Isko har jagah bolne do (Hinglish, dost jaisa, kabhi roast).
- **Referral loop**: share card mein referral code auto-embed, dono ko points.
- **Play Store listing**: screenshots mein mascot + ek-ek benefit line, pehla screenshot hi hook.
- **Educator credit** frame mein dikhne se teachers khud apna content share karenge — free supply-side growth.

## Technical notes

- New: `src/config/brand.ts`, `src/components/brand/BrandLoader.tsx`, `BrandEmptyState.tsx`, `MascotBadge.tsx`.
- Update: `SimulationViewer.tsx` (frame chrome + footer strip), `ShareCardDialog.tsx` / `src/lib/shareCard.ts` (branded template + referral code), toast copy, `NotFound.tsx`, loading fallbacks in `App.tsx`.
- Mascot moods: naye assets generate karke `src/assets/` mein.
- Sab colors semantic tokens se; koi hardcoded hex nahi.

## Suggested order

1. Brand kit + mascot moods
2. Loader, empty states, 404, toasts
3. Share cards + referral embed
4. JEEnie Lab frame for educator animations
5. Play Store assets refresh
