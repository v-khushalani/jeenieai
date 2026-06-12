-- Cancel any stuck/running import jobs from prior runs
UPDATE public.import_jobs
SET status = 'cancelled', finished_at = now(), updated_at = now()
WHERE status IN ('pending', 'running');

-- Replace partial unique index with a non-partial one so supabase-js
-- upsert(onConflict: 'source') can use it as the arbiter index.
DROP INDEX IF EXISTS public.questions_source_uniq;
CREATE UNIQUE INDEX IF NOT EXISTS questions_source_uniq
  ON public.questions(source);