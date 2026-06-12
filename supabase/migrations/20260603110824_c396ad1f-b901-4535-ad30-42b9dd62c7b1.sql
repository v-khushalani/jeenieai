-- Full cleanup of Class 6-10 content (keep only Class 11 & 12)
-- Step 1: delete question_attempts that reference soon-to-be-deleted questions
DELETE FROM public.question_attempts
WHERE question_id IN (
  SELECT q.id FROM public.questions q
  JOIN public.chapters c ON q.chapter_id = c.id
  WHERE c.class_level IS NOT NULL AND c.class_level NOT IN (11, 12)
);

-- Step 2: delete questions in those chapters
DELETE FROM public.questions
WHERE chapter_id IN (
  SELECT id FROM public.chapters
  WHERE class_level IS NOT NULL AND class_level NOT IN (11, 12)
);

-- Step 3: delete topics in those chapters
DELETE FROM public.topics
WHERE chapter_id IN (
  SELECT id FROM public.chapters
  WHERE class_level IS NOT NULL AND class_level NOT IN (11, 12)
);

-- Step 4: delete the chapters themselves
DELETE FROM public.chapters
WHERE class_level IS NOT NULL AND class_level NOT IN (11, 12);