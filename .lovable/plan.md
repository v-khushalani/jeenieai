# Planner cleanup + JEEnie solver fixes

Four fixes, all frontend/presentation only.

## 1. AI Planner looks too complex

- Replace the current planner header (big italic uppercase "JEEnie AI Planner" rocket title + two-line Hinglish subtitle + bordered refresh button) with a quiet single-line header: small "Aaj ka plan" label, the date, and a plain icon-only refresh on the right. No italic/uppercase/rocket.
- Drop the subtitle line entirely — the mission chain already speaks in the coach line right below it.
- Tighten vertical rhythm so the first thing on screen is the active challenge card, not chrome.
- Keep "My Journey" as the collapsed details block, but style it as a quiet muted row rather than a heavy 2px-bordered card.

## 2. Doubt solver icon appearing twice on Study Now

`AIDoubtSolver` is mounted globally in `App.tsx` and again inside `PracticePage.tsx` (which renders `/study-now` and `/practice`), so two floating mascots stack.

- Keep the page-level instance on practice/study-now (it is the one that receives the current question context).
- Make the global instance in `App.tsx` skip rendering on the routes that mount their own instance, so exactly one floating button exists everywhere.

## 3. Content overflowing the solver container

Message bubbles have no width containment, so long formulas, long unbroken words and KaTeX display blocks push past the rounded card.

- Add width containment on the bubble: min-width 0, `break-words`, and overflow handling so nothing escapes the rounded edge.
- Make KaTeX display blocks scroll horizontally inside their own container instead of stretching the bubble.
- Constrain inline code / pre blocks and long links the same way.
- Ensure images inside messages stay within the bubble width.
- Verify on mobile width (full-screen sheet) and the 400px desktop modal.

## 4. Verification

Reload `/ai-planner` and `/study-now` in the preview, open the solver, send a formula-heavy prompt, and confirm: one floating icon, no horizontal overflow, calmer planner header.

## Technical notes

- Files: `src/components/AIStudyPlanner.tsx` (header block around the render root), `src/App.tsx` (conditional global mount), `src/components/AIDoubtSolver.tsx` (bubble + prose containment), plus a small KaTeX overflow rule in `src/index.css` scoped to solver messages.
- No backend, prompt, or business-logic changes.
