
-- Phase 1: Wipe content tables only (preserves auth, profiles, batches, subjects, payments)
TRUNCATE TABLE
  public.questions,
  public.chapters,
  public.topics,
  public.units,
  public.question_attempts,
  public.test_sessions,
  public.group_tests,
  public.topic_mastery,
  public.daily_progress,
  public.points_log,
  public.user_badges,
  public.import_jobs,
  public.extracted_questions_queue,
  public.question_reports,
  public.study_plans,
  public.conversion_prompts,
  public.user_notifications
RESTART IDENTITY CASCADE;

-- Phase 2: Indexes for the new rigid importer
-- Prevent duplicate questions across re-imports (dedup on source)
CREATE UNIQUE INDEX IF NOT EXISTS questions_source_uniq
  ON public.questions (source)
  WHERE source IS NOT NULL;

-- Fast chapter lookup during import (case-insensitive name match within subject/batch)
CREATE INDEX IF NOT EXISTS chapters_subject_name_idx
  ON public.chapters (subject_id, lower(name));

CREATE INDEX IF NOT EXISTS chapters_batch_subject_name_idx
  ON public.chapters (batch_id, subject_id, lower(name));
