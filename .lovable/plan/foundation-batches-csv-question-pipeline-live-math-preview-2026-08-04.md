# Foundation Batches + CSV Question Pipeline + Live Math Preview

## Current state (verified)

- JEE (Class 11/12) and NEET (Class 11/12) batches hold ~69,000 questions with full structure (options, answer, explanation, difficulty, chapter/topic links).
- Foundation batches (Class 6, 7, 8, 9, 10) exist but have **0 chapters and 0 questions**. So chapters are NOT seeded yet.
- There is no CSV import anywhere in the app today. Questions come in only via PDF extraction and the HuggingFace importer.
- A review queue already exists (`extracted_questions_queue` + Extraction Review Queue screen) — the CSV upload will feed into this same queue.
- Math/chemistry rendering already has one shared renderer (`MathDisplay`), used on Practice, Test, Test Results, Battle, Reports and Review Queue.

## 1. Foundation batches get the same structure

- Seed chapters for Class 6-10 following the MTG Foundation Course syllabus:
  - Class 6-8: Physics, Chemistry, Biology, Mathematics
  - Class 9-10: Physics, Chemistry, Biology, Mathematics
- Each chapter gets chapter number, subject, class level, batch link and free/paid flag — exactly the same fields JEE/NEET chapters use, so every existing screen (Study Now, Practice, Tests, Planner) works for Foundation without extra code.
- Subjects rows for each Foundation batch are added so subject tabs show up.
- Questions for Foundation will use the same question schema as JEE/NEET (single correct, multi correct, numerical, assertion-reason), so nothing downstream changes.

## 2. CSV template download + upload

New "Bulk CSV Upload" tab in the admin panel:

- **Download template** button gives a ready CSV with headers and 2 filled sample rows:
  `subject, chapter, topic, question, option_a, option_b, option_c, option_d, correct_answer, question_type, difficulty, explanation, is_pyq, pyq_year, exam, class_level`
- **Upload CSV** → the file is parsed in the browser, each row validated (missing options, invalid answer letter, unknown chapter, duplicate question text).
- Valid + invalid rows both shown in a table with clear error badges; only valid rows can be submitted.
- Submitted rows go into the **review queue** (not live). Admin approves in the existing Review Queue screen, and only then they become live questions attached to the right batch/chapter/topic.
- Batch and grade are chosen once in the UI (dropdown), so the CSV stays simple.

## 3. Live rendering preview while filling/editing

- **CSV upload screen**: each parsed row renders the question and options through the same `MathDisplay` renderer, side-by-side with the raw text, so garbled characters (`Δ`, `√`, `→`, subscripts, LaTeX) are visible before approval.
- **Question edit screen (review queue)**: split view — raw editable text on the left, live rendered output on the right, updating as you type.
- One shared preview component is used in both places, so what you see is exactly what the student sees.

## 4. Formatting consistency everywhere

- Audit every place a question/option/explanation is displayed and route all of them through the same `MathDisplay` (a few admin screens currently print raw text).
- Strengthen the cleanup step in the renderer for the common glitch patterns seen in imported data (mojibake like `â€“`, stray `\\n`, HTML entities, double-escaped LaTeX), so old and new questions render identically.

## Suggestions, pros and cons

**Recommended extras**
- Add a "Glitch scan" button that lists existing questions containing suspicious characters, so bad rows can be found and fixed in bulk instead of one by one.
- Support Excel (.xlsx) upload too — most content teams work in Excel, not CSV; saves them a save-as step.
- Duplicate detection on upload using the existing content hash, so the same question never enters twice.

**Pros**
- Non-technical content team can add questions without developer help.
- Review queue keeps bad data out of the student app.
- Foundation batches become sellable content instead of empty shells.

**Cons / trade-offs**
- CSV is weak for images — image-based questions still need the PDF flow or a URL column.
- Large CSVs (5,000+ rows) will need chunked upload; the first version will cap around 500 rows per file to stay safe.
- Chapter seeding follows MTG naming; if your final content uses different chapter names, they will need renaming later.

## Technical notes

- Migration seeds `chapters` + `batch_subjects` for Foundation batches (Class 6-10).
- CSV parsing client-side with `papaparse`; rows inserted into `extracted_questions_queue` with `source_file = <filename>`, reusing the existing promote-to-questions path.
- New components: `BulkCsvUploader.tsx`, shared `QuestionLivePreview.tsx`; edits to the review queue editor and admin dashboard tab list.
