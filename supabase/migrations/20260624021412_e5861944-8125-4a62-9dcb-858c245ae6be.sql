-- Backfill stale profiles.total_points from points_log, and have leaderboard RPC
-- use live aggregate so other users no longer show 0 points.

UPDATE public.profiles p
SET total_points = COALESCE(s.pts, 0)
FROM (
  SELECT user_id, SUM(points)::int AS pts
  FROM public.points_log
  GROUP BY user_id
) s
WHERE p.id = s.user_id
  AND COALESCE(p.total_points, 0) <> COALESCE(s.pts, 0);

CREATE OR REPLACE FUNCTION public.get_leaderboard_with_stats(limit_count integer DEFAULT 100)
RETURNS TABLE(id uuid, full_name text, avatar_url text, total_points integer, current_streak integer, total_questions bigint, accuracy numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT p.id, p.full_name, p.avatar_url,
    GREATEST(COALESCE(p.total_points,0), COALESCE(pl.pts,0))::int AS total_points,
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
  LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(points),0)::int AS pts
    FROM public.points_log WHERE user_id = p.id
  ) pl ON true
  WHERE COALESCE(p.total_points,0) > 0
     OR COALESCE(pl.pts,0) > 0
     OR COALESCE(qa.total_questions,0) > 0
  ORDER BY GREATEST(COALESCE(p.total_points,0), COALESCE(pl.pts,0)) DESC,
           COALESCE(qa.total_questions,0) DESC
  LIMIT limit_count;
END $function$;

GRANT EXECUTE ON FUNCTION public.get_leaderboard_with_stats(integer) TO anon, authenticated, service_role;