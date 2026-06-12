UPDATE public.questions
SET subject_id = '9a8445e1-d1e0-457c-93fb-e9f13a16e10b'
WHERE subject_id IS NULL AND lower(trim(subject)) = 'chemistry';