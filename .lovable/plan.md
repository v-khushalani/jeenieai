## Audit findings

I logged in as `educator@jeenie.test` and launched the approved `refraction` simulation.

Confirmed from live audit:
- Educator login works and `/educator` opens.
- `Interactive Animations` loads 2 approved simulations from `educator_content`.
- Storage signing and HTML fetch return `200`.
- The iframe is present, full-screen sized, topmost at the tested points, and contains the actual simulation DOM.
- The refraction simulation slider/input state changes correctly when events reach the iframe.

Likely exact issues causing your real preview to differ:
1. **Service worker / PWA stale code mismatch**
   - Runtime error shows `/sw.js` failed to update.
   - Production registers a service worker on preview/published builds.
   - This can make your browser keep older viewer code while my fresh Playwright browser loads latest code, explaining “your screenshots perfect, my real screen blank.”
2. **Fullscreen layering is split across two fullscreen systems**
   - `VirtualLab` requests fullscreen on `document.documentElement`.
   - `SimulationViewer` also has its own fullscreen container logic.
   - This creates fragile stacking/order behavior across real browsers and embedded Lovable preview.
3. **Annotation overlay is above the iframe**
   - Current root overlay is `z-20`; iframe is `z-10`.
   - It uses `pointer-events: none` normally, but its annotation button/panel are clickable overlays above the simulation. This should be isolated so only the annotation controls sit above the iframe, not a full-screen overlay layer.
4. **Parent + injected watermark fallback can still affect rendering**
   - The code tries iframe injection, then parent watermark fallback.
   - For same-origin `srcDoc`, parent fallback should not be needed and should stay disabled once iframe injection succeeds.

## Fix plan

1. **Make fullscreen a single source of truth**
   - Keep fullscreen opening in `VirtualLab` only.
   - Render `SimulationViewer` as a pure full-viewport viewer when launched.
   - Remove/avoid the nested `SimulationViewer` fullscreen toggle path for launched animations.

2. **Hard-fix stacking order**
   - Use this stable order:

```text
z 100  launch overlay shell
z 30   close / annotation controls only
z 20   annotation canvas only when Draw mode is ON
z 10   iframe simulation
z 0    viewer background
```

   - When annotation mode is OFF, no full-screen overlay should sit above the iframe.
   - The “Open Annotation” button should be the only clickable annotation element above the iframe.

3. **Disable parent watermark for HTML simulations that allow iframe injection**
   - For `srcDoc` HTML, inject watermark/protection inside the iframe.
   - Do not render the parent watermark over the iframe unless injection fails.
   - Keep watermark opacity low and `pointer-events: none` inside iframe.

4. **Add a production cache reset for this broken SW generation**
   - Update service-worker registration logic so if `/sw.js` update fails or a new build is detected, it unregisters old service workers and clears app caches once, then reloads.
   - Avoid caching Supabase signed storage URLs for simulations.
   - This directly targets the mismatch between my fresh audit and your real browser.

5. **Add viewer debug guards, not visible UI**
   - Add console/debug-safe checks for iframe load, HTML length, injection success, and top element at center only in development.
   - This makes future “blank screen” reports diagnosable without showing extra student-facing text.

6. **Verify after implementation**
   - Login as educator.
   - Launch `refraction` and `Projectile Motion`.
   - Check screenshot visibility.
   - Programmatically move at least one slider/input and confirm displayed values change.
   - Check `elementFromPoint` over the simulation returns `IFRAME`, not an overlay.
   - Confirm no `/sw.js` update error blocks the app in the current preview.