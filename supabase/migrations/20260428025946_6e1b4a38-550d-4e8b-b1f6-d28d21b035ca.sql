-- Seed proper batches: JEE 11/12, NEET 11/12, Foundation 6-10
INSERT INTO public.batches (name, slug, description, grade, exam_type, is_active, is_free, display_order, price, validity_days, color)
VALUES
  ('JEE 11', 'jee-11', 'JEE Main + Advanced preparation for Class 11', 11, 'JEE', true, false, 1, 0, 365, '#3B82F6'),
  ('JEE 12', 'jee-12', 'JEE Main + Advanced preparation for Class 12', 12, 'JEE', true, false, 2, 0, 365, '#2563EB'),
  ('NEET 11', 'neet-11', 'NEET UG preparation for Class 11', 11, 'NEET', true, false, 3, 0, 365, '#10B981'),
  ('NEET 12', 'neet-12', 'NEET UG preparation for Class 12', 12, 'NEET', true, false, 4, 0, 365, '#059669'),
  ('Foundation 6', 'foundation-6', 'Pre-Foundation for Class 6', 6, 'Foundation', true, true, 5, 0, 365, '#F59E0B'),
  ('Foundation 7', 'foundation-7', 'Pre-Foundation for Class 7', 7, 'Foundation', true, true, 6, 0, 365, '#F59E0B'),
  ('Foundation 8', 'foundation-8', 'Pre-Foundation for Class 8', 8, 'Foundation', true, true, 7, 0, 365, '#F97316'),
  ('Foundation 9', 'foundation-9', 'Pre-Foundation for Class 9', 9, 'Foundation', true, true, 8, 0, 365, '#EA580C'),
  ('Foundation 10', 'foundation-10', 'Pre-Foundation for Class 10', 10, 'Foundation', true, true, 9, 0, 365, '#DC2626')
ON CONFLICT DO NOTHING;