
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS daily_xp INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS daily_xp_date DATE;

CREATE OR REPLACE FUNCTION public.bump_mission_block_progress(
  p_mission_id UUID,
  p_block_id TEXT,
  p_is_correct BOOLEAN,
  p_question_id UUID
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m RECORD;
  new_blocks jsonb;
  block_obj jsonb;
  block_idx INT := -1;
  i INT;
  target INT;
  passing_goal INT;
  attempted INT;
  correct_count INT;
  seen_ids jsonb;
  block_status TEXT;
  is_now_done BOOLEAN := FALSE;
  new_completed INT;
  new_status TEXT;
  xp_reward INT := 0;
  xp_awarded INT := 0;
  bonus_awarded INT := 0;
  today_ist DATE := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  SELECT * INTO m FROM public.daily_missions WHERE id = p_mission_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'mission_not_found'); END IF;
  IF m.user_id <> auth.uid() THEN RETURN jsonb_build_object('ok', false, 'error', 'forbidden'); END IF;

  new_blocks := m.blocks;
  FOR i IN 0 .. jsonb_array_length(new_blocks) - 1 LOOP
    IF (new_blocks -> i ->> 'id') = p_block_id THEN
      block_idx := i;
      EXIT;
    END IF;
  END LOOP;
  IF block_idx < 0 THEN RETURN jsonb_build_object('ok', false, 'error', 'block_not_found'); END IF;

  block_obj := new_blocks -> block_idx;
  target := COALESCE((block_obj ->> 'question_count')::INT, 10);
  passing_goal := COALESCE((block_obj ->> 'passing_goal')::INT, GREATEST(1, (target * 0.6)::INT));
  attempted := COALESCE((block_obj -> 'progress' ->> 'attempted')::INT, 0);
  correct_count := COALESCE((block_obj -> 'progress' ->> 'correct')::INT, 0);
  seen_ids := COALESCE(block_obj -> 'progress' -> 'seen_ids', '[]'::jsonb);
  block_status := COALESCE(block_obj -> 'progress' ->> 'status', 'pending');
  xp_reward := COALESCE((block_obj ->> 'xp_reward')::INT, target * 10);

  IF seen_ids @> to_jsonb(p_question_id::TEXT) THEN
    RETURN jsonb_build_object('ok', true, 'skipped', true, 'block', block_obj);
  END IF;

  attempted := attempted + 1;
  IF p_is_correct THEN correct_count := correct_count + 1; END IF;
  seen_ids := seen_ids || to_jsonb(p_question_id::TEXT);

  IF block_status <> 'done' AND (attempted >= target OR correct_count >= passing_goal) THEN
    block_status := 'done';
    is_now_done := TRUE;
  ELSIF block_status = 'pending' THEN
    block_status := 'in_progress';
  END IF;

  block_obj := jsonb_set(block_obj, '{progress}', jsonb_build_object(
    'attempted', attempted,
    'correct', correct_count,
    'status', block_status,
    'seen_ids', seen_ids
  ));
  new_blocks := jsonb_set(new_blocks, ARRAY[block_idx::TEXT], block_obj);

  new_completed := 0;
  FOR i IN 0 .. jsonb_array_length(new_blocks) - 1 LOOP
    IF (new_blocks -> i -> 'progress' ->> 'status') = 'done' THEN
      new_completed := new_completed + 1;
    END IF;
  END LOOP;

  new_status := m.status;
  IF new_completed >= jsonb_array_length(new_blocks) THEN
    new_status := 'completed';
  ELSIF new_status = 'pending' THEN
    new_status := 'in_progress';
  END IF;

  -- XP: award on block completion + bonus on full mission
  IF is_now_done THEN
    xp_awarded := xp_reward;
  END IF;
  IF is_now_done AND new_status = 'completed' AND m.status <> 'completed' THEN
    bonus_awarded := 100;
  END IF;

  IF (xp_awarded + bonus_awarded) > 0 THEN
    UPDATE public.profiles
    SET total_points = COALESCE(total_points, 0) + xp_awarded + bonus_awarded,
        daily_xp = CASE WHEN daily_xp_date = today_ist
                        THEN COALESCE(daily_xp, 0) + xp_awarded + bonus_awarded
                        ELSE xp_awarded + bonus_awarded END,
        daily_xp_date = today_ist,
        updated_at = now()
    WHERE id = m.user_id;
  END IF;

  UPDATE public.daily_missions
  SET blocks = new_blocks,
      completed_blocks = new_completed,
      status = new_status,
      started_at = COALESCE(started_at, now()),
      completed_at = CASE WHEN new_status = 'completed' THEN now() ELSE completed_at END,
      updated_at = now()
  WHERE id = p_mission_id;

  RETURN jsonb_build_object(
    'ok', true,
    'block', block_obj,
    'block_done', is_now_done,
    'completed_blocks', new_completed,
    'mission_status', new_status,
    'xp_awarded', xp_awarded,
    'bonus_awarded', bonus_awarded
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.bump_mission_block_progress(UUID, TEXT, BOOLEAN, UUID) TO authenticated;
