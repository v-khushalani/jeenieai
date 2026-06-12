UPDATE public.questions
SET subject_id = '0ac0bdf8-ef41-4430-972f-eeb6a207c8e2'
WHERE subject_id IS NULL AND lower(trim(subject)) = 'biology';