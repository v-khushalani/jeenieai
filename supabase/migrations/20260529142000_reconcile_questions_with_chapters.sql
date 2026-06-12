-- Reconcile questions to match their chapter rows (batch_id, subject, chapter)
-- This migration backs up rows that will change into a helper table so the update is reversible.

BEGIN;

-- Create backup table if not exists
CREATE TABLE IF NOT EXISTS public._backup_questions_chapter_reconcile (
  question_id uuid PRIMARY KEY,
  old_batch_id uuid,
  old_subject text,
  old_chapter text,
  backed_up_at timestamptz DEFAULT now()
);

-- Insert rows that would be updated (idempotent due to PK)
INSERT INTO public._backup_questions_chapter_reconcile (question_id, old_batch_id, old_subject, old_chapter)
SELECT q.id, q.batch_id, q.subject, q.chapter
FROM public.questions q
JOIN public.chapters c ON q.chapter_id = c.id
WHERE (
  q.batch_id IS DISTINCT FROM c.batch_id
  OR q.subject IS DISTINCT FROM c.subject
  OR q.chapter IS DISTINCT FROM COALESCE(c.chapter_name, c.name, q.chapter)
)
ON CONFLICT (question_id) DO NOTHING;

-- Perform the reconciliation and return count
WITH updated AS (
  UPDATE public.questions q
  SET
    batch_id = c.batch_id,
    subject = c.subject,
    chapter = COALESCE(c.chapter_name, c.name, q.chapter)
  FROM public.chapters c
  WHERE q.chapter_id = c.id
    AND (
      q.batch_id IS DISTINCT FROM c.batch_id
      OR q.subject IS DISTINCT FROM c.subject
      OR q.chapter IS DISTINCT FROM COALESCE(c.chapter_name, c.name, q.chapter)
    )
  RETURNING q.id
)
SELECT COUNT(*) AS reconciled_count FROM updated;

COMMIT;

-- When run, this migration will create/append to the backup table and
-- update question rows so their batch/subject/chapter match the chapter row.
-- You can inspect rows in public._backup_questions_chapter_reconcile to rollback if needed.

-- Rollback example (manual):
-- UPDATE public.questions q
-- SET batch_id = b.old_batch_id, subject = b.old_subject, chapter = b.old_chapter
-- FROM public._backup_questions_chapter_reconcile b
-- WHERE q.id = b.question_id;
