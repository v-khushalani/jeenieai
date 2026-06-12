-- 1. content_hash column + unique partial index
ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS content_hash text;

UPDATE public.questions
SET content_hash = md5(lower(regexp_replace(coalesce(question_text, question, ''), '\s+', ' ', 'g')))
WHERE content_hash IS NULL
  AND coalesce(question_text, question, '') <> '';

-- Unique partial index: prevents future duplicates from being inserted.
-- (We do NOT delete existing duplicates here; that requires explicit user confirmation.)
-- To allow the migration to succeed while existing dups remain, the index is non-unique for now.
-- A second migration will swap it to UNIQUE once dedup is approved.
CREATE INDEX IF NOT EXISTS idx_questions_content_hash
  ON public.questions(content_hash)
  WHERE content_hash IS NOT NULL;

-- 2. Performance indexes
CREATE INDEX IF NOT EXISTS idx_questions_chapter_difficulty
  ON public.questions(chapter_id, difficulty)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_questions_batch_subject_difficulty
  ON public.questions(batch_id, subject_id, difficulty)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_questions_pyq
  ON public.questions(pyq_exam, pyq_year)
  WHERE is_pyq = true;

-- 3. Backfill NULL difficulties via exam heuristic
UPDATE public.questions
SET difficulty = CASE
  WHEN exam ILIKE '%advanced%' THEN 'Hard'
  WHEN exam ILIKE '%bitsat%' THEN 'Easy'
  WHEN exam ILIKE '%mh%cet%' OR exam ILIKE '%mhcet%' THEN 'Easy'
  WHEN exam ILIKE '%jee%' THEN 'Medium'
  WHEN exam ILIKE '%neet%' THEN 'Medium'
  WHEN exam ILIKE '%aiims%' THEN 'Medium'
  WHEN exam ILIKE '%jipmer%' THEN 'Medium'
  ELSE 'Medium'
END
WHERE difficulty IS NULL;

-- 4. Sanitize leaked source_db values in exam column
UPDATE public.questions
SET exam = NULL
WHERE exam ILIKE '%.db';