-- Sync profile.total_points with points_log sum and keep in sync via trigger
UPDATE public.profiles p
SET total_points = sub.pts
FROM (SELECT user_id, COALESCE(SUM(points),0)::int AS pts FROM public.points_log GROUP BY user_id) sub
WHERE p.id = sub.user_id AND COALESCE(p.total_points,0) <> sub.pts;

CREATE OR REPLACE FUNCTION public.sync_profile_total_points()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected_user uuid;
BEGIN
  affected_user := COALESCE(NEW.user_id, OLD.user_id);
  UPDATE public.profiles
    SET total_points = COALESCE((SELECT SUM(points)::int FROM public.points_log WHERE user_id = affected_user), 0)
    WHERE id = affected_user;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_profile_total_points ON public.points_log;
CREATE TRIGGER trg_sync_profile_total_points
AFTER INSERT OR UPDATE OR DELETE ON public.points_log
FOR EACH ROW EXECUTE FUNCTION public.sync_profile_total_points();