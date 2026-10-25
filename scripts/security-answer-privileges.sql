-- Read-only catalog regression; run with the Supabase read-query tool.
-- Every row must have can_read = false before release.
SELECT r.rolname AS role, a.attname AS column_name,
       has_column_privilege(r.oid, 'public.questions', a.attname, 'SELECT') AS can_read
FROM pg_roles r
CROSS JOIN pg_attribute a
WHERE r.rolname IN ('anon', 'authenticated')
  AND a.attrelid = 'public.questions'::regclass
  AND a.attname IN ('correct_option', 'correct_options', 'correct_answer',
                   'numerical_answer', 'numerical_tolerance', 'explanation',
                   'explanation_image_url')
ORDER BY r.rolname, a.attname;