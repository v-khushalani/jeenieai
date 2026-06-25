CREATE OR REPLACE FUNCTION public.get_leaderboard_with_stats(limit_count integer DEFAULT 100)
 RETURNS TABLE(id uuid, full_name text, avatar_url text, total_points integer, current_streak integer, total_questions bigint, accuracy numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT p.id, p.full_name, p.avatar_url,
    COALESCE(p.total_points,0)::int AS total_points,
    COALESCE(p.current_streak,0) AS current_streak,
    COALESCE(qa.total_questions,0)::bigint AS total_questions,
    COALESCE(qa.accuracy,0) AS accuracy
  FROM public.profiles p
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::bigint AS total_questions,
      CASE WHEN COUNT(*) > 0
        THEN ROUND((COUNT(*) FILTER (WHERE is_correct)::numeric / COUNT(*)::numeric)*100, 1)
        ELSE 0 END AS accuracy
    FROM public.question_attempts qa2 WHERE qa2.user_id = p.id
  ) qa ON true
  WHERE COALESCE(p.total_points,0) > 0
     OR COALESCE(qa.total_questions,0) > 0
  ORDER BY COALESCE(p.total_points,0) DESC,
           COALESCE(qa.total_questions,0) DESC
  LIMIT limit_count;
END $function$;