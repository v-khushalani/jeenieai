# Educator: teach any class + growth engine

## Part 1 — Remove the class lock for educators

Today a teacher's own saved class (11 or 12) decides everything they can build a test from. The test builder reads the teacher's own profile (target exam + class) and pulls only chapters from that one batch, so a Class 12 teacher cannot make a Class 11 test. Chapters/animation tabs already have an "All classes" option; the test builder does not.

What changes:

1. **Class + stream picker inside the test builder.**
   At the top of "Create Group Test" the teacher first picks:
   - Class: 6, 7, 8, 9, 10, 11, 12 (multi-select allowed, default = none, must pick at least one)
   - Track: Foundation / JEE / NEET / MHT-CET (auto-suggested from the chosen class: 6–10 → Foundation, 11–12 → JEE/NEET/CET choice)
   Subjects and chapters then load for that chosen class, not for the teacher's own profile.

2. **Chapter list follows the picked class.**
   Chapters are fetched by the selected class level (and matching batches), instead of being pinned to the teacher's personal batch. A Class 12 teacher picking Class 11 sees Class 11 chapters.

3. **Questions follow the picked track.**
   The question pull uses the selected track's exam values plus the selected class, so a Foundation Class 8 test pulls Class 8 questions, not JEE ones.

4. **Ready-made full tests stay available** (JEE Mains / NEET / MHT-CET presets) but only appear when Class 11/12 is selected.

5. **Empty state honesty.** If the chosen class + subject has no questions yet, show the "Coming soon" banner with the exact count available instead of a silent failure.

6. **Optional teacher profile field:** "Classes I teach" (multi-select) that just pre-ticks the picker — a convenience, never a restriction.

## Part 2 — The real growth levers

Ranked by impact per effort. Recommended order: 1 → 2 → 3, then the rest.

**1. Group Test = the viral loop (highest lever, already half-built)**
- Teacher/student creates a test → one link + QR + auto-generated WhatsApp message.
- Live leaderboard while the test runs; result card at the end is a shareable image with rank, score, and the student's name.
- Anyone opening a shared link can attempt as a guest for the first test, then must sign up to see their rank. This turns every test into signups.
- "Challenge a friend" button on every finished test: sends the same question set to a friend, winner gets points.

**2. Streaks with something at stake**
- Daily streak already exists; add a visible cost of breaking it (streak freeze that costs points, one free freeze a week).
- Evening nudge notification only to students who solved 0 questions that day.
- Weekly "Sunday Report" — accuracy, chapters cleared, rank change — delivered as a shareable card.

**3. Class-level leaderboards, not global**
Global leaderboards demotivate. Rank students within their own class + city + their teacher's group. Show "You are #4 in your class" — that is the line that gets screenshotted.

**4. Rewards that feel real**
Points store with tiers: JEEnie stickers, notes PDFs, one-month Pro, and one monthly big prize (headphones/tablet) drawn among students above a streak threshold. Announce winners publicly.

**5. Battles**
1v1 timed 10-question duel on a chapter, matched by class. Fast, replayable, endlessly shareable.

**6. Teacher as distribution**
Every teacher who signs up brings 30–150 students. Give teachers: a class code, a class dashboard (who is falling behind), and free Pro for the teacher when 20 of their students join. This is the cheapest acquisition channel available.

**7. Content moments students share**
Roast cards, meme badges, "I solved 100 questions" milestone cards — each auto-generated as an image with the app name and a join link.

## Technical notes

- `src/pages/CreateGroupTestPage.tsx`: replace `profile.grade` / `profile.target_exam` driven state with explicit `selectedGrades: number[]` and `selectedTrack` state; chapter query filters on `class_level` (plus batch match) instead of `batch_id` from `getBatchForStudent`; question query uses `mapBatchToExamValues(selectedTrack)` and a class filter.
- Reuse `GRADES`/subject constants pattern already used in `EducatorChapters.tsx`.
- Presets gated behind `selectedGrades` containing 11 or 12.
- Part 2 items are separate follow-up builds; only say the word and I start with the group-test viral loop.
