-- Delete non-JEE/NEET aligned questions (user confirmed)
-- Keeps only: 'JEE Main', 'JEE Mains', 'JEE Advanced', 'JEE', 'NEET', 'Foundation', 'Scholarship'
-- Deletes: BITSAT, WBJEE, AP EAMCET, TS EAMCET, MHT CET, KCET, KVPY, VITEEE, COMEDK, NDA, AIIMS, JIPMER, NULL

-- Cascade: also remove dependent question_attempts to avoid orphans
DELETE FROM public.question_attempts
WHERE question_id IN (
  SELECT id FROM public.questions
  WHERE exam IS NULL
     OR exam IN ('BITSAT','WBJEE','AP EAMCET','TS EAMCET','MHT CET','MHT-CET','MH-CET','MH_CET','KCET','KVPY','VITEEE','COMEDK','NDA','AIIMS','JIPMER')
);

-- Remove from question_reports too
DELETE FROM public.question_reports
WHERE question_id IN (
  SELECT id FROM public.questions
  WHERE exam IS NULL
     OR exam IN ('BITSAT','WBJEE','AP EAMCET','TS EAMCET','MHT CET','MHT-CET','MH-CET','MH_CET','KCET','KVPY','VITEEE','COMEDK','NDA','AIIMS','JIPMER')
);

-- Now delete the questions themselves
DELETE FROM public.questions
WHERE exam IS NULL
   OR exam IN ('BITSAT','WBJEE','AP EAMCET','TS EAMCET','MHT CET','MHT-CET','MH-CET','MH_CET','KCET','KVPY','VITEEE','COMEDK','NDA','AIIMS','JIPMER');