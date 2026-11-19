CREATE OR REPLACE FUNCTION public.get_leaderboard_with_stats(limit_count integer DEFAULT 100)
 RETURNS TABLE(id uuid, full_name text, avatar_url text, total_points integer, current_streak integer, total_questions bigint, accuracy numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT p.id, p.full_name, p.avatar_url,
    COALESCE(p.total_points,0)::int,
    COALESCE(p.current_streak,0),
    COALESCE(qa.total_questions,0)::bigint,
    COALESCE(qa.accuracy,0)
  FROM public.profiles p
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::bigint AS total_questions,
      CASE WHEN COUNT(*) > 0
        THEN ROUND((COUNT(*) FILTER (WHERE is_correct)::numeric / COUNT(*)::numeric)*100, 1)
        ELSE 0 END AS accuracy
    FROM public.question_attempts qa2 WHERE qa2.user_id = p.id
  ) qa ON true
  WHERE (COALESCE(p.total_points,0) > 0 OR COALESCE(qa.total_questions,0) > 0)
    AND lower(COALESCE(p.email,'')) NOT IN ('user@jeenie.website','pro@jeenie.website','proplus@jeenie.website','educator@jeenie.website','admin@jeenie.website','super@jeenie.website')
    AND lower(COALESCE(p.email,'')) NOT LIKE '%@jeenie.test'
    AND lower(COALESCE(p.email,'')) NOT LIKE '%@jeenieapp.test'
    AND COALESCE(p.full_name,'') NOT ILIKE 'test %'
    AND NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = p.id AND r.role IN ('admin','super_admin','educator'))
  ORDER BY COALESCE(p.total_points,0) DESC, COALESCE(qa.total_questions,0) DESC
  LIMIT limit_count;
END $function$;