
-- Subjects (idempotent on slug-like code enum)
INSERT INTO public.subjects (code, name, display_order, is_active)
VALUES
  ('PHYSICS', 'Physics', 1, true),
  ('CHEMISTRY', 'Chemistry', 2, true),
  ('MATHEMATICS', 'Mathematics', 3, true),
  ('BIOLOGY', 'Biology', 4, true)
ON CONFLICT DO NOTHING;

-- Batches (idempotent on slug)
CREATE UNIQUE INDEX IF NOT EXISTS batches_slug_key ON public.batches (slug);

INSERT INTO public.batches (name, slug, exam_type, grade, description, display_order, is_free, is_active, price)
VALUES
  ('JEE 11', 'jee-11', 'JEE', 11, 'JEE Main + Advanced — Class 11', 10, true, true, 0),
  ('JEE 12', 'jee-12', 'JEE', 12, 'JEE Main + Advanced — Class 12', 11, true, true, 0),
  ('NEET 11', 'neet-11', 'NEET', 11, 'NEET preparation — Class 11', 20, true, true, 0),
  ('NEET 12', 'neet-12', 'NEET', 12, 'NEET preparation — Class 12', 21, true, true, 0),
  ('Foundation 6', 'foundation-6', 'Foundation', 6, 'Class 6 Foundation', 60, true, true, 0),
  ('Foundation 7', 'foundation-7', 'Foundation', 7, 'Class 7 Foundation', 61, true, true, 0),
  ('Foundation 8', 'foundation-8', 'Foundation', 8, 'Class 8 Foundation', 62, true, true, 0),
  ('Foundation 9', 'foundation-9', 'Foundation', 9, 'Class 9 Foundation', 63, true, true, 0),
  ('Foundation 10', 'foundation-10', 'Foundation', 10, 'Class 10 Foundation', 64, true, true, 0)
ON CONFLICT (slug) DO NOTHING;

-- Batch-subject mappings (idempotent)
CREATE UNIQUE INDEX IF NOT EXISTS batch_subjects_unique ON public.batch_subjects (batch_id, subject);

WITH jee_batches AS (
  SELECT id FROM public.batches WHERE slug IN ('jee-11', 'jee-12')
),
neet_batches AS (
  SELECT id FROM public.batches WHERE slug IN ('neet-11', 'neet-12')
),
foundation_batches AS (
  SELECT id FROM public.batches WHERE slug LIKE 'foundation-%'
)
INSERT INTO public.batch_subjects (batch_id, subject, display_order)
SELECT id, s, ord FROM jee_batches
CROSS JOIN (VALUES ('Physics', 1), ('Chemistry', 2), ('Mathematics', 3)) AS v(s, ord)
UNION ALL
SELECT id, s, ord FROM neet_batches
CROSS JOIN (VALUES ('Physics', 1), ('Chemistry', 2), ('Biology', 3)) AS v(s, ord)
UNION ALL
SELECT id, s, ord FROM foundation_batches
CROSS JOIN (VALUES ('Physics', 1), ('Chemistry', 2), ('Mathematics', 3), ('Biology', 4)) AS v(s, ord)
ON CONFLICT (batch_id, subject) DO NOTHING;
