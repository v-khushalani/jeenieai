-- Allow chapter seeding for Foundation grades (6-10) plus senior grades (11-12)
-- Error fixed: violates check constraint "chapters_class_level_check"

ALTER TABLE public.chapters
DROP CONSTRAINT IF EXISTS chapters_class_level_check;

ALTER TABLE public.chapters
ADD CONSTRAINT chapters_class_level_check
CHECK (class_level BETWEEN 6 AND 12);
