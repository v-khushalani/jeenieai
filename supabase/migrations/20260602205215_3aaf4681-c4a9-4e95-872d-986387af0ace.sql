UPDATE public.questions
SET subject_id = '3daa0679-d312-4507-92df-e602f36c7483'
WHERE subject_id IS NULL AND lower(trim(subject)) IN ('mathematics','maths','math');