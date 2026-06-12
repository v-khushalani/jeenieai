UPDATE public.questions
SET subject_id = '185c1ad6-eacb-4f0f-8e28-481cd384d9be'
WHERE subject_id IS NULL AND lower(trim(subject)) = 'physics';