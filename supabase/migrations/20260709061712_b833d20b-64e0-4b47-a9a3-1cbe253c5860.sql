-- Wipe all user-generated / user-owned data. Content tables are preserved.
-- Truncate user data tables first (CASCADE handles anything we miss).
TRUNCATE TABLE
  public.question_attempts,
  public.daily_missions,
  public.daily_progress,
  public.class_logs,
  public.points_log,
  public.revision_schedule,
  public.referrals,
  public.user_notifications,
  public.push_subscriptions,
  public.user_badges,
  public.user_roles,
  public.user_batch_subscriptions,
  public.study_plans,
  public.study_plan_progress,
  public.topic_mastery,
  public.question_reports,
  public.test_sessions,
  public.test_attempt_violations,
  public.battle_answers,
  public.battle_players,
  public.battle_sessions,
  public.battle_rewards,
  public.payments,
  public.payment_audit,
  public.promo_redemptions,
  public.ai_request_log,
  public.conversion_prompts,
  public.profiles
RESTART IDENTITY CASCADE;

-- Now delete all auth users
DELETE FROM auth.users;
