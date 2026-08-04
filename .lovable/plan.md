# Fix Class 12 Chemistry count + final audit

## The 312 bug — root cause confirmed

The database actually stores JEE questions with exam value **`JEE Main`** (28,789 rows) and `JEE Advanced` (761). But two counting functions filter on the wrong spelling:

```sql
OR (p_exam ILIKE '%jee%' AND q.exam IN ('JEE Mains', 'JEE Advanced'))
```

`JEE Mains` (with the s) does not exist in the data. So a JEE student's Chemistry count collapses to only the JEE Advanced rows (~249 across Class 11+12) instead of the real 6,302 Class 12 + 2,791 Class 11 Chemistry questions. Affected: `get_chapter_question_counts(p_subject, p_batch_ids, p_exam)` and `get_subject_question_counts`. The other overload `get_chapter_question_counts(p_chapter_ids, p_exam)` and `fetch_unseen_questions` already use the correct full list, which is why practice sometimes serves questions the counts say don't exist.

**Fix:** use one exam-family list everywhere — `('JEE','JEE Main','JEE Mains','JEE Advanced')` for JEE, `('NEET')` for NEET.

## Shared subjects across exam families

Physics and Chemistry Class 11-12 syllabus is ~90% common between JEE and NEET. Today 15,679 Class 12 Chemistry questions sit locked behind the NEET tag while JEE students see 6,122.

Proposed rule (applies to Physics + Chemistry only, never Biology→JEE or Maths→NEET):

- JEE student: JEE-tagged questions first, then NEET-tagged Physics/Chemistry as fill-in.
- NEET student: NEET-tagged first, then JEE Main Physics/Chemistry as fill-in (JEE Advanced excluded — too hard for NEET).
- Counts shown in the UI reflect the same pooled number so counts and practice agree.

Implemented inside `fetch_unseen_questions` (ordering: native exam → shared → damaged last) and in both count functions.

## Rest of the audit — what is still off

**Blockers**
- Count/serve mismatch above (all JEE subjects, not just Chemistry).
- **Class 11 has zero Biology chapters** while Class 12 has 40 — a NEET Class 11 student has no Biology path at all.

**Should-fix**
- 16,082 questions still flagged `damaged` (LaTeX lost on import) vs 53,325 `ok`. They are deprioritized but still reachable once a chapter runs out of clean ones. Options: keep repairing in background, or hard-hide `damaged` from students until repaired.
- 8 questions in `needs_review` — never served, safe to leave or purge.
- **Foundation Classes 6-10: every chapter is empty** (~207 chapters, 0 questions). Coming Soon banner covers it visually, but the grades are effectively non-functional; consider hiding Class 6-10 signup until content lands.
- Class 11 Mathematics: 2 empty chapters; Class 12 Biology: 2 empty chapters.
- `chapters.subject` casing normalization was skipped earlier; count functions use `ILIKE` so it works, but any new exact-match query will silently return 0.

**Enhance**
- Add a nightly consistency check (counts vs actually servable questions per chapter) surfaced in the admin Reports Hub, so this class of bug shows up before a student sees it.

## Technical notes

- One migration replacing: `get_chapter_question_counts` (both overloads), `get_subject_question_counts`, `fetch_unseen_questions`, plus a shared `public.exam_family(text) → text[]` helper so the list lives in exactly one place.
- Grants: `REVOKE EXECUTE ... FROM anon`, `GRANT EXECUTE ... TO authenticated` on each recreated function.
- Frontend `src/constants/examValues.ts` already lists the full JEE family — no change needed there; the client-side `buildExamOrClause` path stays as is.
- No question rows are edited; this is filter logic only.
