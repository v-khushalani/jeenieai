ALTER TABLE public.league_members
  ADD COLUMN IF NOT EXISTS next_tier text,
  ADD COLUMN IF NOT EXISTS final_rank integer;

CREATE OR REPLACE FUNCTION public.tier_shift(p_tier text, p_delta integer)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  WITH t AS (SELECT ARRAY['bronze','silver','gold','platinum','diamond'] AS arr)
  SELECT (SELECT arr FROM t)[
    GREATEST(1, LEAST(5, COALESCE(array_position((SELECT arr FROM t), COALESCE(p_tier,'bronze')), 1) + p_delta))
  ];
$$;

-- Closes every league cycle that has already ended and has not been settled yet.
CREATE OR REPLACE FUNCTION public.close_league_cycle()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_settled integer := 0;
BEGIN
  WITH ranked AS (
    SELECT m.id,
           l.tier,
           (SELECT count(*) FROM public.league_members x WHERE x.league_id = m.league_id) AS size,
           RANK() OVER (PARTITION BY m.league_id ORDER BY m.xp DESC, m.joined_at ASC) AS rnk
    FROM public.league_members m
    JOIN public.leagues l ON l.id = m.league_id
    WHERE l.cycle_end < v_today AND m.next_tier IS NULL
  )
  UPDATE public.league_members m
  SET final_rank = r.rnk::integer,
      next_tier = CASE
        WHEN r.size < 5 THEN r.tier
        WHEN r.rnk <= 7 THEN public.tier_shift(r.tier, 1)
        WHEN r.rnk > GREATEST(7, r.size - 5) THEN public.tier_shift(r.tier, -1)
        ELSE r.tier
      END,
      updated_at = now()
  FROM ranked r
  WHERE m.id = r.id;

  GET DIAGNOSTICS v_settled = ROW_COUNT;
  RETURN jsonb_build_object('settled_members', v_settled, 'closed_on', v_today);
END;
$$;

REVOKE ALL ON FUNCTION public.close_league_cycle() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.close_league_cycle() TO service_role;

-- Join uses the tier earned last week
CREATE OR REPLACE FUNCTION public.join_current_league()
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_start date := public.current_cycle_start();
  v_end date := v_start + 6;
  v_tier text := 'bronze';
  v_league uuid;
BEGIN
  IF v_uid IS NULL THEN RETURN NULL; END IF;

  SELECT lm.league_id INTO v_league
  FROM public.league_members lm
  JOIN public.leagues l ON l.id = lm.league_id
  WHERE lm.user_id = v_uid AND l.cycle_start = v_start
  LIMIT 1;
  IF v_league IS NOT NULL THEN RETURN v_league; END IF;

  SELECT COALESCE(lm.next_tier, l.tier) INTO v_tier
  FROM public.league_members lm
  JOIN public.leagues l ON l.id = lm.league_id
  WHERE lm.user_id = v_uid
  ORDER BY l.cycle_start DESC LIMIT 1;
  v_tier := COALESCE(v_tier, 'bronze');

  SELECT l.id INTO v_league
  FROM public.leagues l
  WHERE l.cycle_start = v_start AND l.tier = v_tier
    AND (SELECT count(*) FROM public.league_members m WHERE m.league_id = l.id) < 30
  ORDER BY l.created_at
  LIMIT 1;

  IF v_league IS NULL THEN
    INSERT INTO public.leagues (tier, cycle_start, cycle_end)
    VALUES (v_tier, v_start, v_end)
    RETURNING id INTO v_league;
  END IF;

  INSERT INTO public.league_members (league_id, user_id)
  VALUES (v_league, v_uid)
  ON CONFLICT (league_id, user_id) DO NOTHING;

  RETURN v_league;
END;
$$;