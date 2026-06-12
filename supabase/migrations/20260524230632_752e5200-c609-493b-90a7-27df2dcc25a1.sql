
-- Recreate views as security_invoker so RLS of the caller applies
DROP VIEW IF EXISTS public.questions_public;
CREATE VIEW public.questions_public WITH (security_invoker = true) AS
SELECT id, question, question_text, question_image_url, option_a, option_b, option_c, option_d,
  options, question_type, difficulty, subject, subject_id, chapter, chapter_id, topic_id, batch_id,
  exam, exam_relevance, year, pyq_year, source, is_active, created_at
FROM public.questions WHERE is_active = true;

DROP VIEW IF EXISTS public.referrals_safe;
CREATE VIEW public.referrals_safe WITH (security_invoker = true) AS
SELECT id, referrer_id, referred_user_id, referral_code, status, reward_granted, created_at, completed_at
FROM public.referrals;

-- Revoke public execute on SECURITY DEFINER functions; grant only to authenticated where needed
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.upsert_topic_mastery(uuid, uuid, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.log_points(uuid, int, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_leaderboard_with_stats(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_leaderboard_with_stats(int) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_promo_code(text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.validate_promo_code(text, text, uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.update_own_profile(text, text, text, text, text, int, boolean, text, int, date, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_own_profile(text, text, text, text, text, int, boolean, text, int, date, text[]) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.ensure_daily_progress(uuid, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_daily_progress(uuid, int) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_daily_progress(uuid, boolean, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_daily_progress(uuid, boolean, int) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.update_daily_accuracy(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_daily_accuracy(uuid, numeric) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_subscriptions() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_question_answer(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.validate_question_answer(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_topic_mastery(uuid, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
