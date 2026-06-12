
-- Foundation batches for Grades 6, 7, 8 (Grades 9, 10 already exist).
INSERT INTO public.batches (name, slug, grade, exam_type, is_active, price, display_order)
VALUES
  ('Foundation Class 6', 'foundation-6', 6, 'Foundation', true, 0, 6),
  ('Foundation Class 7', 'foundation-7', 7, 'Foundation', true, 0, 7),
  ('Foundation Class 8', 'foundation-8', 8, 'Foundation', true, 0, 8)
ON CONFLICT (slug) DO NOTHING;

-- Attach Physics / Chemistry / Biology / Mathematics to every Foundation batch (6-10).
INSERT INTO public.batch_subjects (batch_id, subject, display_order)
SELECT b.id, s.subject, s.ord
FROM public.batches b
CROSS JOIN (VALUES
  ('Physics', 1),
  ('Chemistry', 2),
  ('Biology', 3),
  ('Mathematics', 4)
) AS s(subject, ord)
WHERE b.exam_type = 'Foundation'
  AND b.grade BETWEEN 6 AND 10
  AND NOT EXISTS (
    SELECT 1 FROM public.batch_subjects bs
    WHERE bs.batch_id = b.id AND bs.subject = s.subject
  );
