-- Resetting the platform for fresh launch
TRUNCATE public.question_attempts CASCADE;
TRUNCATE public.daily_progress CASCADE;
TRUNCATE public.study_plan_progress CASCADE;
TRUNCATE public.user_badges CASCADE;
TRUNCATE public.user_streak_history CASCADE;
TRUNCATE public.notifications CASCADE;
TRUNCATE public.group_tests CASCADE;
TRUNCATE public.test_attempts CASCADE;
TRUNCATE public.group_test_results CASCADE;

-- Reset some profile stats back to 0
UPDATE public.profiles 
SET 
  total_questions_solved = 0, 
  overall_accuracy = 0,
  current_streak = 0,
  total_points = 0,
  longest_streak = 0;
