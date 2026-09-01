# Community UI + Damaged Question Repair Console + Mobile Pass + Pre-launch Checks

## Verified current state

- Community: the four tables (`community_posts`, `community_replies`, `community_votes`, `community_reports`) exist in the database, but there is **no Community page, no route, and no `community` feature flag**. That is why nothing shows — the frontend was never built.
- Questions: 53,310 active and clean (`ok`), **16,082 quarantined as `damaged` (inactive)**, 8 `needs_review` (still active), 15 inactive but clean.
- There is **no admin screen anywhere to see or repair damaged questions**. The repair edge function (`repair-question-latex`) exists but can only be triggered manually with a token — the admin panel has no button for it.
- Feature flags currently off: battle_mode, educator_content, leaderboard, roast_meme, snapshot, study_notes, virtual_lab, wrapped_yearbook.

---

## 1. Community (make it actually visible)

- New page at `/community`, linked from the main nav and mobile bottom nav.
- Feed scoped to the student's own grade + goal exam (Class 11 JEE sees only Class 11 JEE).
- Post types: Doubt, Discussion, Resource. Optional image upload and optional link to a question from the bank.
- Threaded replies, upvotes, and a "Mark as solved" action for the original poster (awards the 25 JEEnie Points already wired in the database).
- Report button on every post/reply; reports land in a new Community moderation tab in the admin panel (hide/unhide, resolve).
- New `community` feature flag, default ON, so you can kill it instantly if it gets noisy.
- Empty feed shows an inviting "Pehla sawaal tum pucho" prompt instead of a blank screen.

## 2. Damaged Questions repair console (admin)

New admin section: **Question Health** (sidebar, under Tools).

- Top row: counts of Clean / Damaged / Needs review / Orphan (no chapter or grade), filterable by grade, subject and chapter.
- A worklist of damaged questions, paginated, with search.
- **Split-screen editor: form on the left, live student preview on the right** — exactly as it renders for a student, including LaTeX and any diagrams. The preview updates as you type, and shows a warning chip if glitch characters (Â, ï¿½, stray spacing) are still present.
- Per-question actions: **Save & mark repaired** (sets `text_quality = ok` and reactivates the question), **Save as needs review**, **Delete permanently**.
- **Auto-repair with AI** button: runs the existing repair function on a batch (e.g. 50 at a time) with a progress bar, then drops results into the same worklist for your eyeball check before they go live. Nothing auto-publishes without a human pass.
- A "Repaired today / remaining" counter so the 16,082 backlog is visibly shrinking.

## 3. Mobile responsiveness pass

- **AI Doubt Solver on mobile**: make the dialog a full-height bottom sheet (no fixed ~400px desktop width), with a safe-area-aware input bar that stays above the keyboard, horizontally scrollable LaTeX/code blocks so long formulas never spill outside the bubble, and a smaller draggable launcher constrained inside the screen so it can't be dragged half off-screen or sit under the bottom nav.
- **Every page checked on a real phone viewport (360x740 and 390x844)** across all roles: landing, login/signup, dashboard, planner (Today / Journey / Rewards), practice, test attempt and results, analytics, rewards, profile, settings, community, educator portal and the full admin panel. Anything that overflows horizontally, has tap targets under 44px, or hides its primary action behind a scroll gets fixed.
- Admin panel is the most desktop-biased area — wide tables get card layouts on mobile, and the sidebar collapses to a drawer.
- Delivered as a written list of what was broken and what was fixed, with screenshots.

## 4. Final pre-launch suggestions

- **Reactivate the 8 `needs_review` questions or hide them** — they are live right now and unverified. Recommend hiding until reviewed.
- **Chapter coverage guard**: hide from practice/test any chapter with fewer than 10 usable questions, so no student ever hits "no questions available" (Class 6-10 are all at 0 questions today and will otherwise be dead ends).
- **Foundation grades 6-10 have zero questions.** Either keep those batches hidden until the CSV pipeline fills them, or show a clear "Launching soon" state. Selling them empty is the fastest way to lose trust.
- **Delete-account flow in Settings** — required by Google Play before the app can be listed.
- Keep leaderboard and battle mode off until roughly 200 active students, as already decided.

## Technical notes

- New: `src/pages/Community.tsx`, `CommunityPostCard`, `CommunityComposer`, `CommunityThread`, `src/hooks/useCommunity.ts`, route + nav entry, `community` row in `feature_flags`.
- New: `src/components/admin/QuestionHealthManager.tsx` reusing the existing `QuestionLivePreview` for the right-hand preview pane; wired into `AdminDashboard.tsx` nav and router.
- Auto-repair calls `repair-question-latex` from the admin UI through an authenticated admin check rather than the hardcoded setup token.
- Chapter coverage guard uses the existing `get_chapter_question_counts` RPC — filter client-side in practice/test chapter pickers.
- No breaking schema changes; only additive (a `community` feature flag row, and possibly one index on `questions(text_quality)` for the worklist).
