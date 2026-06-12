
INSERT INTO public.subjects (code, name, display_order, icon, is_active)
SELECT 'MATHEMATICS'::subject_code, 'Mathematics', 4, '∑', true
WHERE NOT EXISTS (SELECT 1 FROM public.subjects WHERE code = 'MATHEMATICS'::subject_code);
