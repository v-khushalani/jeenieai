
-- questions: text topic alongside topic_id
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS topic text;

-- extracted_questions_queue: reviewer notes
ALTER TABLE public.extracted_questions_queue ADD COLUMN IF NOT EXISTS review_notes text;

-- admin_notifications: who sent it
ALTER TABLE public.admin_notifications ADD COLUMN IF NOT EXISTS sent_by uuid;

-- group_tests: frontend-friendly aliases
ALTER TABLE public.group_tests ADD COLUMN IF NOT EXISTS test_code text;
ALTER TABLE public.group_tests ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.group_tests ADD COLUMN IF NOT EXISTS subject text;
ALTER TABLE public.group_tests ADD COLUMN IF NOT EXISTS chapter_names jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.group_tests ADD COLUMN IF NOT EXISTS duration_minutes integer;
ALTER TABLE public.group_tests ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
UPDATE public.group_tests SET test_code = code WHERE test_code IS NULL AND code IS NOT NULL;
UPDATE public.group_tests SET created_by = host_id WHERE created_by IS NULL AND host_id IS NOT NULL;
UPDATE public.group_tests SET duration_minutes = time_limit WHERE duration_minutes IS NULL AND time_limit IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS group_tests_test_code_key ON public.group_tests(test_code) WHERE test_code IS NOT NULL;

-- test_sessions: link to a group test
ALTER TABLE public.test_sessions ADD COLUMN IF NOT EXISTS group_test_id uuid;

-- profiles: dynamic badges + goal lock timestamp
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS badges jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS goal_locked_at timestamptz;

-- badges: extra fields used by showcase
ALTER TABLE public.badges ADD COLUMN IF NOT EXISTS points_required integer DEFAULT 0;
ALTER TABLE public.badges ADD COLUMN IF NOT EXISTS color text DEFAULT 'blue';
ALTER TABLE public.badges ADD COLUMN IF NOT EXISTS category text DEFAULT 'achievement';

-- educator_content: fields used by upload/review flow
ALTER TABLE public.educator_content ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT false;
ALTER TABLE public.educator_content ADD COLUMN IF NOT EXISTS subject text;
ALTER TABLE public.educator_content ADD COLUMN IF NOT EXISTS grade integer;
ALTER TABLE public.educator_content ADD COLUMN IF NOT EXISTS file_path text;
ALTER TABLE public.educator_content ADD COLUMN IF NOT EXISTS embed_url text;
ALTER TABLE public.educator_content ADD COLUMN IF NOT EXISTS original_filename text;
ALTER TABLE public.educator_content ADD COLUMN IF NOT EXISTS uploaded_by uuid;
ALTER TABLE public.educator_content ADD COLUMN IF NOT EXISTS display_order integer DEFAULT 0;
UPDATE public.educator_content SET uploaded_by = educator_id WHERE uploaded_by IS NULL AND educator_id IS NOT NULL;

-- push_subscriptions: updated_at
ALTER TABLE public.push_subscriptions ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- questions_public view: expose fields used by the practice/diagnostic UI
DROP VIEW IF EXISTS public.questions_public CASCADE;
CREATE VIEW public.questions_public
WITH (security_invoker = true) AS
SELECT
  id,
  question,
  question_text,
  option_a, option_b, option_c, option_d,
  options,
  question_image_url,
  subject,
  chapter,
  topic,
  subject_id,
  chapter_id,
  topic_id,
  difficulty,
  exam,
  exam_relevance,
  question_type,
  is_active,
  is_verified,
  is_pyq,
  pyq_year,
  year,
  created_at,
  updated_at
FROM public.questions
WHERE is_active = true;

GRANT SELECT ON public.questions_public TO authenticated, anon;
