
-- Add missing columns the HF importer writes to
ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS content_hash text,
  ADD COLUMN IF NOT EXISTS pyq_session text,
  ADD COLUMN IF NOT EXISTS pyq_exam text,
  ADD COLUMN IF NOT EXISTS language text DEFAULT 'en';

-- Unique partial index for dedup (NULLs allowed, only enforce when hash present)
CREATE UNIQUE INDEX IF NOT EXISTS questions_content_hash_uidx
  ON public.questions (content_hash)
  WHERE content_hash IS NOT NULL;

-- Helpful lookup indexes for import + practice queries
CREATE INDEX IF NOT EXISTS questions_chapter_id_idx ON public.questions (chapter_id);
CREATE INDEX IF NOT EXISTS questions_topic_id_idx ON public.questions (topic_id);
CREATE INDEX IF NOT EXISTS questions_batch_id_idx ON public.questions (batch_id);
CREATE INDEX IF NOT EXISTS questions_subject_id_idx ON public.questions (subject_id);
CREATE INDEX IF NOT EXISTS questions_is_active_idx ON public.questions (is_active);

-- import_jobs: add dataset_path + updated_at the importer references
ALTER TABLE public.import_jobs
  ADD COLUMN IF NOT EXISTS dataset_path text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Chapter slug uniqueness so importer's slug-based lookup works reliably
CREATE UNIQUE INDEX IF NOT EXISTS chapters_slug_uidx
  ON public.chapters (slug)
  WHERE slug IS NOT NULL;
