
-- 1) Revoke broad EXECUTE from public, anon, authenticated on every function in public
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT n.nspname AS sch, p.proname AS fn, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind = 'f'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon, authenticated', r.fn, r.args);
  END LOOP;
END$$;

-- 2) Re-grant EXECUTE only to authenticated for functions actually used as RPCs from the client
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_subject_question_counts(uuid[], text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_chapter_question_counts(text, uuid[], text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_topic_question_counts(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_leaderboard_with_stats(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_and_reset_streak(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_streak_stats(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_practice_stats(uuid, integer, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_topic_mastery(uuid, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_question_answer(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_question_answer(uuid, text[], numeric, exam_code) TO authenticated;
GRANT EXECUTE ON FUNCTION public.change_user_goal(uuid, text, integer, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_own_profile(text, text, text, text, text, integer, boolean, text, integer, date, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_referral(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reset_user_progress(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_subscription() TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_points(uuid, text, integer, text, uuid) TO authenticated;
