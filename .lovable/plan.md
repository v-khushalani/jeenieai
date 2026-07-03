# Grade 7-10 Question Bank (Foundation) + Strict Grade Isolation

Goal: Class 7/8/9/10 users get their own chapters + questions from real NCERT-aligned Foundation books that YOU upload. No cross-grade bleed. Same UX quality as 11/12.

## Sources (based on your choice)

- **Primary (you'll upload)**: Foundation books ke chapter-wise MCQ / exercise PDFs. Aap unhi ko upload karoge — Pearson IIT Foundation, MTG Foundation, Arihant Foundation, Disha Foundation, DC Pandey Foundation, HC Verma Concepts (Class 9-10), Lakhmir Singh Science, RD Sharma / RS Aggarwal Maths, etc.
- **Fallback (only if you say so later)**: LearnCBSE / Selfstudys chapter-wise MCQ scrape via Firecrawl. Not in scope for v1 — sirf tab jab tumhari books mein gap ho.

No Hugging Face imports (you said waste questions aa jaate hain). No NCERT Exemplar auto-pipeline unless you upload those PDFs.

## Curriculum structure (as chosen: P/C/B split early)

| Grade | Subjects |
|---|---|
| 7 | Physics, Chemistry, Biology, Mathematics |
| 8 | Physics, Chemistry, Biology, Mathematics |
| 9 | Physics, Chemistry, Biology, Mathematics |
| 10 | Physics, Chemistry, Biology, Mathematics |

Chapter list = Foundation book TOC (Pearson/MTG-style — closely mirrors NCERT with P/C/B split even in 7-8). We'll seed a canonical Foundation chapter list per (grade, subject); admins can rename/reorder later.

## Plan

### 1. Schema — add grade to questions
- Migration: `ALTER TABLE questions ADD COLUMN class_level smallint;`
- Backfill from `chapters.class_level` (existing 11/12 rows).
- Trigger `BEFORE INSERT/UPDATE OF chapter_id ON questions` → set `NEW.class_level = (SELECT class_level FROM chapters WHERE id = NEW.chapter_id)`.
- Index `(class_level, subject, chapter_id)`.
- Rationale: single-column filter = fast planner/practice/test queries and admin listing.

### 2. Seed Foundation chapters (grade 7, 8, 9, 10 × P/C/B/Math)
- New edge function `seed-foundation-chapters` (or extend existing `seed-chapters`) with the canonical Foundation TOC per (grade, subject).
- Idempotent: skip if `(class_level, subject, chapter_number)` already exists.
- `exam = 'Foundation'`, `class_level = 7/8/9/10`.
- One-click "Seed Foundation chapters" button in admin.

### 3. Question upload flow for Foundation books (your primary path)
- Reuse `extract-pdf-questions` edge function + `extracted_questions_queue` review UI.
- Admin upload wizard for Foundation:
  1. Pick Grade (7/8/9/10) → Subject (P/C/B/Math) → Chapter.
  2. Upload PDF (chapter-wise, or whole book with chapter markers).
  3. Extract → queue with `class_level`, `subject`, `chapter_id` pre-filled.
  4. Admin reviews, bulk-approves → inserts into `questions`; trigger sets `class_level`.
- Per-upload source tag (e.g. `source = 'Pearson Foundation Class 9 Physics'`) for provenance and future de-dupe.

### 4. Strict grade isolation (Roadmap + Planner + Practice + Test + Admin)

a) `src/lib/roadmapEngine.ts`
- `subjectsForExam(exam, userGrade?)` — for Foundation return `['Physics','Chemistry','Biology','Mathematics']` for that grade only.
- `buildSubjectRoadmap(userId, exam, subject, userGrade?)` — add `.eq('class_level', userGrade)` on the chapters query when `exam === 'Foundation'` (or grade is 7-10).

b) `src/lib/studyPlannerCore.ts` and any planner query — filter chapters by `class_level = userGrade` for Foundation users. 11/12 (JEE/NEET) keeps today's combined behaviour.

c) Practice + Test generation — `src/services/api/modules/questions.ts` random/filter queries add `.eq('class_level', userGrade)` for Foundation users. Cleanest with the new column from step 1.

d) Admin — Questions and Chapters lists get a "Grade" filter pill (6/7/8/9/10/11/12). Default = All; when set, filters both list and coverage counts.

### 5. Admin coverage widget
- Small dashboard card: for each (grade 7-10, subject) show chapters seeded + questions live + questions in review queue. Highlights gaps so you know which book to upload next.

## Technical section

- `class_level` denormalized on `questions` avoids joins on every read; trigger keeps it in sync with `chapters` on insert/update of `chapter_id`.
- Foundation user detection: `parseGrade(profiles.grade)` returns 7-10 → treat as Foundation regardless of `target_exam` string. Prefer `exam === 'Foundation'` when set, else derive from grade.
- No new exam strings needed — `Foundation-7`, `Foundation-8`, ..., `Foundation-10` already exist in `getTargetExamFromGrade`.
- PDF ingestion reuses the existing pipeline; only the admin wizard UI is new.
- LearnCBSE/Selfstudys scrape can be added later as a supplemental importer using Firecrawl, feeding the same review queue — out of scope for v1.

## Deliverables order
1. Migration: `class_level` on questions + trigger + index + backfill.
2. Seed Foundation chapters for grades 7-10 (P/C/B/Math).
3. Roadmap + planner + practice + test filter by `class_level = userGrade` for Foundation.
4. Admin: grade filter on lists + Foundation upload wizard + coverage widget.
5. You upload Foundation book PDFs → review queue → approve.
