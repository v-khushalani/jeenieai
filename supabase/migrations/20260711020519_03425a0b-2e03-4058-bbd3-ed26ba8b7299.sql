
-- Enable realtime on daily_missions so CoachMissionPanel updates live as blocks progress
ALTER TABLE public.daily_missions REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'daily_missions'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.daily_missions';
  END IF;
END $$;

-- RPC: atomically bump a mission block's progress and auto-mark done when target hit
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
  new_blocks JSONB;
  new_completed INT;
  new_status TEXT;
  block_obj JSONB;
  block_idx INT;
  target INT;
  attempted INT;
  correct_count INT;
  passing_goal INT;
  seen_ids JSONB;
  block_status TEXT;
  is_now_done BOOLEAN := FALSE;
BEGIN
  SELECT * INTO m FROM public.daily_missions WHERE id = p_mission_id AND user_id = auth.uid();
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  new_blocks := m.blocks;
  block_idx := -1;
  FOR i IN 0 .. jsonb_array_length(new_blocks) - 1 LOOP
    IF (new_blocks -> i ->> 'id') = p_block_id THEN
      block_idx := i;
      EXIT;
    END IF;
  END LOOP;
  IF block_idx < 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'block_not_found');
  END IF;

  block_obj := new_blocks -> block_idx;
  target := COALESCE((block_obj ->> 'question_count')::INT, 10);
  passing_goal := COALESCE((block_obj ->> 'passing_goal')::INT, GREATEST(1, (target * 0.6)::INT));
  attempted := COALESCE((block_obj -> 'progress' ->> 'attempted')::INT, 0);
  correct_count := COALESCE((block_obj -> 'progress' ->> 'correct')::INT, 0);
  seen_ids := COALESCE(block_obj -> 'progress' -> 'seen_ids', '[]'::jsonb);
  block_status := COALESCE(block_obj -> 'progress' ->> 'status', 'pending');

  -- Idempotency: skip if this question already counted for this block
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

  -- Recount done blocks
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
    'mission_status', new_status
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.bump_mission_block_progress(UUID, TEXT, BOOLEAN, UUID) TO authenticated;
