-- Step 1: repoint TOPICS first so the kept chapter owns all topics
WITH ranked AS (
  SELECT id, chapter_name,
         ROW_NUMBER() OVER (PARTITION BY chapter_name ORDER BY created_at, id) AS rn,
         FIRST_VALUE(id) OVER (PARTITION BY chapter_name ORDER BY created_at, id) AS keep_id
  FROM public.chapters
  WHERE subject = 'Chemistry' AND is_active = true
)
UPDATE public.topics t
SET chapter_id = r.keep_id
FROM ranked r
WHERE t.chapter_id = r.id AND r.rn > 1;

-- Step 2: now repoint QUESTIONS — their topic_id already lives under the new chapter, so trigger passes
WITH ranked AS (
  SELECT id, chapter_name,
         ROW_NUMBER() OVER (PARTITION BY chapter_name ORDER BY created_at, id) AS rn,
         FIRST_VALUE(id) OVER (PARTITION BY chapter_name ORDER BY created_at, id) AS keep_id
  FROM public.chapters
  WHERE subject = 'Chemistry' AND is_active = true
)
UPDATE public.questions q
SET chapter_id = r.keep_id
FROM ranked r
WHERE q.chapter_id = r.id AND r.rn > 1;

-- Step 3: delete the duplicate chapter rows
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY chapter_name ORDER BY created_at, id) AS rn
  FROM public.chapters
  WHERE subject = 'Chemistry' AND is_active = true
)
DELETE FROM public.chapters
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- Step 4: disable Chemistry rows that are actually Biology
UPDATE public.chapters
SET is_active = false
WHERE subject = 'Chemistry'
  AND chapter_name IN (
    'Human Health and Disease',
    'Body Fluids and Circulation',
    'Breathing and Exchange of Gases',
    'Mineral Nutrition',
    'Molecular Basis of Inheritance'
  );

-- Step 5: staging table for AI chapter remap suggestions
CREATE TABLE IF NOT EXISTS public.question_chapter_remap (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  question_id uuid NOT NULL UNIQUE,
  current_chapter_id uuid,
  suggested_chapter_id uuid,
  suggested_chapter_name text,
  confidence numeric NOT NULL DEFAULT 0,
  in_syllabus boolean NOT NULL DEFAULT true,
  model_reason text,
  applied boolean NOT NULL DEFAULT false,
  applied_at timestamptz,
  processed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_qcr_applied ON public.question_chapter_remap(applied);
CREATE INDEX IF NOT EXISTS idx_qcr_confidence ON public.question_chapter_remap(confidence);
CREATE INDEX IF NOT EXISTS idx_qcr_in_syllabus ON public.question_chapter_remap(in_syllabus);
CREATE INDEX IF NOT EXISTS idx_qcr_suggested_chapter ON public.question_chapter_remap(suggested_chapter_id);

ALTER TABLE public.question_chapter_remap ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage question_chapter_remap" ON public.question_chapter_remap;
CREATE POLICY "Admins manage question_chapter_remap"
ON public.question_chapter_remap
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));