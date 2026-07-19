
-- Wipe user-generated data, preserve content
TRUNCATE TABLE
  public.question_attempts,
  public.test_sessions,
  public.test_attempt_violations,
  public.points_log,
  public.topic_mastery,
  public.user_batch_subscriptions,
  public.daily_progress,
  public.daily_missions,
  public.study_plans,
  public.study_plan_progress,
  public.user_badges,
  public.user_notifications,
  public.push_subscriptions,
  public.referrals,
  public.conversion_prompts,
  public.question_reports,
  public.question_edit_history,
  public.class_logs,
  public.revision_schedule,
  public.battle_answers,
  public.battle_players,
  public.battle_rewards,
  public.battle_sessions,
  public.group_tests,
  public.ai_request_log,
  public.payments,
  public.payment_audit,
  public.promo_redemptions,
  public.admin_notifications,
  public.user_roles,
  public.profiles
RESTART IDENTITY CASCADE;

-- Delete all auth users
DELETE FROM auth.users;
