
-- Wipe every content/user table in public schema
TRUNCATE TABLE
  public.questions,
  public.chapters,
  public.topics,
  public.units,
  public.question_attempts,
  public.test_sessions,
  public.group_tests,
  public.topic_mastery,
  public.daily_progress,
  public.points_log,
  public.user_badges,
  public.badges,
  public.import_jobs,
  public.extracted_questions_queue,
  public.question_reports,
  public.study_plans,
  public.conversion_prompts,
  public.user_notifications,
  public.admin_notifications,
  public.push_subscriptions,
  public.referrals,
  public.user_batch_subscriptions,
  public.payments,
  public.educator_content,
  public.feature_flags,
  public.exam_config,
  public.batch_subjects,
  public.batches,
  public.subjects,
  public.user_roles,
  public.profiles
RESTART IDENTITY CASCADE;

-- Wipe auth.users (will cascade-delete any auth.identities, sessions, refresh_tokens via Supabase internal FKs)
DELETE FROM auth.users;
