
-- 1) Drop the orphaned mission trigger that references a dropped table and was making question_attempts inserts fail.
DROP TRIGGER IF EXISTS trg_advance_today_mission ON public.question_attempts;
DROP FUNCTION IF EXISTS public.advance_today_mission_on_attempt() CASCADE;

-- 2) Dedupe chapters: pick canonical (earliest created) per (subject, class_level, chapter_number, lower(chapter_name))
-- Then reassign all FK references from dup -> canonical, finally deactivate dups.
WITH ranked AS (
  SELECT id, subject, class_level, chapter_number, lower(coalesce(chapter_name, name, '')) AS norm_name,
    row_number() OVER (
      PARTITION BY subject, class_level, chapter_number, lower(coalesce(chapter_name, name, ''))
      ORDER BY created_at, id
    ) AS rn,
    first_value(id) OVER (
      PARTITION BY subject, class_level, chapter_number, lower(coalesce(chapter_name, name, ''))
      ORDER BY created_at, id
    ) AS canonical_id
  FROM public.chapters
  WHERE is_active = true
),
mapping AS (
  SELECT id AS dup_id, canonical_id
  FROM ranked
  WHERE rn > 1 AND id <> canonical_id
)
SELECT count(*) FROM mapping;

-- reassign references via a DO block
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    WITH ranked AS (
      SELECT id,
        row_number() OVER (
          PARTITION BY subject, class_level, chapter_number, lower(coalesce(chapter_name, name, ''))
          ORDER BY created_at, id
        ) AS rn,
        first_value(id) OVER (
          PARTITION BY subject, class_level, chapter_number, lower(coalesce(chapter_name, name, ''))
          ORDER BY created_at, id
        ) AS canonical_id
      FROM public.chapters
      WHERE is_active = true
    )
    SELECT id AS dup_id, canonical_id FROM ranked WHERE rn > 1 AND id <> canonical_id
  LOOP
    UPDATE public.questions       SET chapter_id = r.canonical_id WHERE chapter_id = r.dup_id;
    UPDATE public.topics          SET chapter_id = r.canonical_id WHERE chapter_id = r.dup_id;
    UPDATE public.study_notes     SET chapter_id = r.canonical_id WHERE chapter_id = r.dup_id;
    UPDATE public.concept_maps    SET chapter_id = r.canonical_id WHERE chapter_id = r.dup_id;
    BEGIN
      UPDATE public.educator_content SET chapter_id = r.canonical_id WHERE chapter_id = r.dup_id;
    EXCEPTION WHEN others THEN NULL;
    END;
    BEGIN
      UPDATE public.study_plan_progress SET chapter_id = r.canonical_id WHERE chapter_id = r.dup_id;
    EXCEPTION WHEN unique_violation THEN
      DELETE FROM public.study_plan_progress WHERE chapter_id = r.dup_id;
    END;
    UPDATE public.chapters SET is_active = false WHERE id = r.dup_id;
  END LOOP;
END $$;

-- 3) Prevent recurrence with a partial unique index on active chapters.
CREATE UNIQUE INDEX IF NOT EXISTS chapters_unique_active_idx
  ON public.chapters (subject, class_level, chapter_number, lower(coalesce(chapter_name, name, '')))
  WHERE is_active = true;
