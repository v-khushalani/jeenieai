INSERT INTO public.batches (name, slug, description, grade, exam_type, is_active, is_free, color, display_order, price, validity_days)
VALUES
  ('JEE 11', 'jee-11', 'JEE Main + Advanced preparation for Class 11', 11, 'JEE', true, false, '#3B82F6', 1, 0, 365),
  ('JEE 12', 'jee-12', 'JEE Main + Advanced preparation for Class 12', 12, 'JEE', true, false, '#2563EB', 2, 0, 365),
  ('NEET 11', 'neet-11', 'NEET UG preparation for Class 11', 11, 'NEET', true, false, '#10B981', 3, 0, 365),
  ('NEET 12', 'neet-12', 'NEET UG preparation for Class 12', 12, 'NEET', true, false, '#059669', 4, 0, 365),
  ('Foundation 6', 'foundation-6', 'Pre-Foundation for Class 6', 6, 'Foundation', true, true, '#F59E0B', 5, 0, 365),
  ('Foundation 7', 'foundation-7', 'Pre-Foundation for Class 7', 7, 'Foundation', true, true, '#F59E0B', 6, 0, 365),
  ('Foundation 8', 'foundation-8', 'Pre-Foundation for Class 8', 8, 'Foundation', true, true, '#F97316', 7, 0, 365),
  ('Foundation 9', 'foundation-9', 'Pre-Foundation for Class 9', 9, 'Foundation', true, true, '#EA580C', 8, 0, 365),
  ('Foundation 10', 'foundation-10', 'Pre-Foundation for Class 10', 10, 'Foundation', true, true, '#DC2626', 9, 0, 365)
ON CONFLICT DO NOTHING;