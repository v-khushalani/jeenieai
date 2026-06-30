## Audit findings from the current build

### What is actually broken
1. **Roadmap is not connected correctly to DB right now**
   - Console/network shows the exact failure: `invalid input value for enum exam_code: "JEE"`.
   - `chapters.exam_relevance` is an enum array with only: `JEE_MAINS`, `JEE_ADVANCED`, `NEET`.
   - Current code sends invalid values like `JEE`, `JEE_MAIN`, `JEE Main`, `JEE Mains`, so Supabase rejects the query and the UI falls back to `0/0 chapters`.

2. **This Week is also affected by the same invalid enum filter**
   - The chapter pool query also sends invalid enum values.
   - That is why it shows `Light day`, `Mixed`, or generic tasks instead of real chapter tasks.

3. **Weakness/Medium/Strong is not reliable**
   - The UI reads `topic_mastery`, but the live attempt data clearly has weak chapters.
   - Example from DB: Electrostatics, Current Electricity, Chemical Kinetics, Limits etc. have low accuracy, but Insights still shows `Weak 0 / Medium 0 / Strong 0` because `topic_mastery` shape/data is not aligned with what the planner expects.
   - Best source should be `question_attempts` joined with `questions` and `chapters`, not stale/incomplete `topic_mastery` rows.

4. **Current planner mixes two systems**
   - New Roadmap tab uses chapter ladder.
   - This Week + Insights still use older generic topic planner.
   - Result: Roadmap says no chapters, Week says light days, Insights says no weaknesses — all disconnected from each other.

### What is good
- DB actually has strong syllabus data: Physics 63 chapters, Chemistry 67, Mathematics 35, Biology 40.
- Questions are linked to real `chapter_id`, so chapter-wise roadmap can be made accurate.
- `question_attempts` has enough data to compute real weak chapters and accuracy.
- The vertical mentor roadmap concept is still the right direction.

### What is bad / should be removed from planner
- Generic `Light day`, `Mixed`, placeholder-like copy.
- `0/0 chapters cleared` when data exists.
- Weakness cards that depend on stale `topic_mastery`.
- Rank projection in planner: it feels random and not actionable here. Analytics can keep rank-type stuff; planner should guide action.
- The current Week tab needs scroll and feels like a list, not a mentor schedule.

## Implementation plan

### 1. Fix the real DB connection bug
- Replace all planner enum filters with only valid DB enum values:
  - JEE: `JEE_MAINS`, `JEE_ADVANCED`
  - NEET: `NEET`
- Apply this in:
  - `roadmapEngine.ts`
  - `AIStudyPlanner.tsx` chapter pool query
- Stop using invalid values like `JEE`, `JEE_MAIN`, `JEE Main` in `exam_relevance` queries.

### 2. Make one single planner data engine
- Build planner metrics from live DB:
  - `chapters`
  - `questions`
  - `question_attempts`
  - `study_plan_progress`
- For each chapter compute:
  - total questions available
  - user attempts
  - correct/wrong
  - accuracy
  - pending mistakes
  - milestone completion
  - status: locked / active / done
- `topic_mastery` will no longer be the primary source for planner weakness cards.

### 3. Rebuild Roadmap into a true mentor ladder
- Show real chapters immediately.
- First active chapter should be the earliest unfinished chapter in syllabus order.
- Each chapter should show clear next action:
  - Learn basics: solve 15 questions
  - Fix weak spots: improve to 70%+
  - Revise mistakes: redo wrong questions
  - Chapter test: timed chapter test
- If a chapter has no topics, use chapter-level practice directly.
- No placeholder copy like “jaldi aa rahe hai” unless there is truly no DB data.

### 4. Rebuild This Week from the roadmap, not generic mastery
- Week tab should be generated from active roadmap chapters:
  - Day 1-2: active chapter learn/practice
  - Day 3: weak chapter drill
  - Day 4: mistakes review
  - Day 5: next chapter start
  - Day 6: chapter/subject test
  - Day 7: light revision/checkpoint
- Every task should deep-link to the exact chapter/mode.
- Mobile UI should use horizontal day chips/swipe-first layout, not a long boring scroll.

### 5. Rebuild Insights into actionable mentor insights
- Replace current SWOT/rank block with:
  - “Next chapter to finish”
  - “Weakest chapters right now”
  - “Mistakes pending”
  - “Ready for chapter test?”
  - “Coverage by subject”
- Weak/Medium/Strong counts should be computed from real chapter attempts:
  - Weak: accuracy below 60% with attempts
  - Medium: 60-79%
  - Strong: 80%+
  - Untouched chapters separate as `Pending`, not incorrectly hidden.

### 6. Wire deep links properly
- `/study-now?chapter_id=...&mode=learn|drill|review` should open the respective chapter practice directly or at least preselect that chapter.
- `/test?chapter_id=...&mode=chapter` should preselect chapter test setup or start with that chapter context.
- This makes the planner actually guide the student point-to-point.

### 7. Mobile polish for current planner page
- Remove cramped KPI cards or compress them into a cleaner single row.
- Keep Roadmap as primary first screen.
- Make tabs and subject selector horizontally swipe-friendly.
- Ensure no bottom nav/floating AI overlap hides planner content.

## Expected result
- Roadmap will show real Physics/Chemistry/Mathematics chapters instead of `0/0`.
- Weakness will show actual weak chapters from attempts.
- This Week will no longer show generic `Light day` unless it is an intentional rest day.
- Planner becomes a mentor: “start this chapter, do this milestone, then this test”, with every action connected to practice/test pages.