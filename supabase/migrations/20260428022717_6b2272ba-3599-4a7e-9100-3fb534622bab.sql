
-- Create missing batches
INSERT INTO public.batches (name, exam_type, grade, is_active, is_free, description, display_order)
VALUES
  ('JEE 12', 'JEE', 12, true, false, 'Class 12 JEE preparation', 2),
  ('NEET 11', 'NEET', 11, true, false, 'Class 11 NEET preparation', 3),
  ('NEET 12', 'NEET', 12, true, false, 'Class 12 NEET preparation', 4)
ON CONFLICT DO NOTHING;

-- Link orphan chapters to correct batches based on subject + class_level
-- Biology -> NEET
UPDATE public.chapters
SET batch_id = (SELECT id FROM public.batches WHERE name = 'NEET 11' LIMIT 1)
WHERE batch_id IS NULL AND subject = 'Biology' AND class_level = 11;

UPDATE public.chapters
SET batch_id = (SELECT id FROM public.batches WHERE name = 'NEET 12' LIMIT 1)
WHERE batch_id IS NULL AND subject = 'Biology' AND class_level = 12;

-- Physics / Chemistry / Mathematics class 11 -> JEE 11
UPDATE public.chapters
SET batch_id = (SELECT id FROM public.batches WHERE name = 'JEE 11' LIMIT 1)
WHERE batch_id IS NULL AND subject IN ('Physics','Chemistry','Mathematics') AND class_level = 11;

-- Physics / Chemistry / Mathematics class 12 -> JEE 12
UPDATE public.chapters
SET batch_id = (SELECT id FROM public.batches WHERE name = 'JEE 12' LIMIT 1)
WHERE batch_id IS NULL AND subject IN ('Physics','Chemistry','Mathematics') AND class_level = 12;

-- Re-tag NEET questions away from JEE 11 batch into NEET 11 batch (safer guess; admin can refine)
UPDATE public.questions
SET batch_id = (SELECT id FROM public.batches WHERE name = 'NEET 11' LIMIT 1)
WHERE exam = 'NEET'
  AND batch_id = (SELECT id FROM public.batches WHERE name = 'JEE 11' LIMIT 1);

-- Assign sequential chapter_number where missing, partitioned by batch+subject
WITH numbered AS (
  SELECT id,
    ROW_NUMBER() OVER (PARTITION BY batch_id, subject ORDER BY chapter_name) AS rn
  FROM public.chapters
  WHERE chapter_number IS NULL AND batch_id IS NOT NULL
)
UPDATE public.chapters c
SET chapter_number = n.rn
FROM numbered n
WHERE c.id = n.id;

-- Ensure batch_subjects has entries for new batches
INSERT INTO public.batch_subjects (batch_id, subject, display_order)
SELECT b.id, s.subject, s.ord
FROM public.batches b
CROSS JOIN (VALUES ('Physics',1),('Chemistry',2),('Mathematics',3)) AS s(subject, ord)
WHERE b.name = 'JEE 12'
ON CONFLICT DO NOTHING;

INSERT INTO public.batch_subjects (batch_id, subject, display_order)
SELECT b.id, s.subject, s.ord
FROM public.batches b
CROSS JOIN (VALUES ('Physics',1),('Chemistry',2),('Biology',3)) AS s(subject, ord)
WHERE b.name IN ('NEET 11','NEET 12')
ON CONFLICT DO NOTHING;
