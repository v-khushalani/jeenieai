
-- Reset activity data (Corrected: 'exam_family' check)
TRUNCATE TABLE public.question_attempts CASCADE;
TRUNCATE TABLE public.question_reports CASCADE;
TRUNCATE TABLE public.study_plan_progress CASCADE;
TRUNCATE TABLE public.daily_progress CASCADE;
TRUNCATE TABLE public.user_badges CASCADE;
TRUNCATE TABLE public.user_notifications CASCADE;
TRUNCATE TABLE public.points_log CASCADE;
TRUNCATE TABLE public.battle_answers CASCADE;
TRUNCATE TABLE public.battle_players CASCADE;
TRUNCATE TABLE public.battle_sessions CASCADE;
TRUNCATE TABLE public.battle_rewards CASCADE;
TRUNCATE TABLE public.test_sessions CASCADE;
TRUNCATE TABLE public.test_attempt_violations CASCADE;
TRUNCATE TABLE public.daily_missions CASCADE;
TRUNCATE TABLE public.study_plans CASCADE;

-- Cleanup orphaned profiles and roles
DELETE FROM public.profiles WHERE id NOT IN (SELECT id FROM auth.users);
DELETE FROM public.user_roles WHERE user_id NOT IN (SELECT id FROM auth.users);

-- Production Optimization Indexes
CREATE INDEX IF NOT EXISTS idx_questions_text_quality_ok ON public.questions(text_quality) WHERE text_quality = 'ok';
-- Re-checking if chapter_id and class_level are better suited for the count index
CREATE INDEX IF NOT EXISTS idx_questions_class_level_quality ON public.questions(class_level) WHERE text_quality = 'ok';
