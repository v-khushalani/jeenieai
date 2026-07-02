## Goal

Ek shareable QR code system taaki Instagram/WhatsApp pe post karke log scan karke JEEnie AI install kar sake (Play Store pe abhi tak nahi hain).

## What gets built

### 1. New public page: `/share`
Full-screen poster-style page — Instagram story / WhatsApp status ke liye perfect screenshot.

**Layout (mobile-first, 390px optimized):**
- Brand gradient background (uses existing `--primary` #013062 theme tokens)
- JEEnie AI logo + wordmark on top
- Big headline: "Scan to install JEEnie AI"
- Sub: "India's smartest JEE/NEET prep — free to start"
- Large white QR card (280×280) pointing to `https://jeenieai.lovable.app/install`
- Below QR: "Point your camera → tap the link → Add to Home Screen"
- 3 trust chips: "AI Doubt Solver • PYQs • Free"
- Two buttons at bottom:
  - **Download poster** (renders the whole card to PNG via `html-to-image`, saves as `jeenie-install-qr.png`)
  - **Copy link** (copies `/install` URL)
- Small footer: `jeenieai.lovable.app/install`

**Route:** public (no auth) — added to `src/App.tsx` above the `*` catch-all. Not behind any feature flag so it always works for marketing.

**SEO:** proper `<title>`, meta description, og tags so WhatsApp/Instagram link previews look good if someone shares the URL directly.

### 2. QR block on existing `/install` page
Add a compact QR card in `src/pages/InstallApp.tsx` (below the install button):
- Small QR (160×160) of the same install URL
- Text: "On desktop? Scan with your phone to install."
- Useful when someone opens the page on laptop.

### 3. QR generation
Use existing `src/utils/qrCode.ts` (`qrcode-generator` already installed) — `generateQRCodeSVG(url, size)`. No new dependency for QR.

For poster download: add `html-to-image` (small, ~15KB) to convert the QR card DOM to PNG. Fallback: if download fails, offer share via Web Share API on mobile.

### 4. Discoverability (optional, small)
- Add a subtle "Share app 📲" link in the mobile Settings page pointing to `/share` so users can share with friends (viral growth).

## Technical details

**Files:**
- **Create** `src/pages/SharePage.tsx` — the poster page
- **Edit** `src/App.tsx` — add `<Route path="/share" element={<SharePage />} />` (public, lazy-loaded)
- **Edit** `src/pages/InstallApp.tsx` — add compact QR card section
- **Edit** `src/pages/Settings.tsx` — add "Share app" row linking to `/share` (small addition)
- **Install** `html-to-image` via bun

**QR target URL:** `https://jeenieai.lovable.app/install` (hardcoded to published URL so QR works even when scanned from a printed/shared image outside the app context).

**Design tokens:** all colors from `index.css` semantic tokens (`--primary`, `--background`, `--foreground`) — no hardcoded hex in components. Matches existing dark-blue brand.

**No backend / DB changes.** Pure frontend.

## Out of scope
- Play Store / TWA setup
- Dynamic QR (per-user referral QR) — can be added later if you want referral tracking baked into the QR
- Print-ready A4 poster PDF

Ready to build?
