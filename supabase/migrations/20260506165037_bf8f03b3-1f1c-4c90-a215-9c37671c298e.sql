CREATE TABLE IF NOT EXISTS public.import_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_path text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  total integer DEFAULT 0,
  imported integer NOT NULL DEFAULT 0,
  skipped integer NOT NULL DEFAULT 0,
  chapters_created integer NOT NULL DEFAULT 0,
  topics_created integer NOT NULL DEFAULT 0,
  skip_reasons jsonb NOT NULL DEFAULT '{}'::jsonb,
  options jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  created_by uuid,
  started_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

ALTER TABLE public.import_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage import jobs"
ON public.import_jobs
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_import_jobs_started_at ON public.import_jobs(started_at DESC);

-- Idempotency: same source + same question text cannot be inserted twice.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_questions_source_qhash
  ON public.questions ((source), md5(question_text))
  WHERE source IS NOT NULL AND question_text IS NOT NULL;