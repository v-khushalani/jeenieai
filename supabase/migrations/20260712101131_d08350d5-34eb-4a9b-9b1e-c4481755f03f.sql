
-- Auto-match a question attempt to today's mission block by chapter_id.
-- Lets progress reflect in the planner even when the student practices from
-- Study Now / Roadmap directly (no deep-link params).
CREATE OR REPLACE FUNCTION public.bump_mission_progress_by_chapter(
  p_chapter_id UUID,
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
  matched_block_id TEXT;
  today_ist DATE;
BEGIN
  today_ist := (now() AT TIME ZONE 'Asia/Kolkata')::date;

  SELECT * INTO m
  FROM public.daily_missions
  WHERE user_id = auth.uid()
    AND mission_date = today_ist
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_mission_today');
  END IF;

  -- Find first non-done block matching this chapter
  FOR i IN 0 .. jsonb_array_length(m.blocks) - 1 LOOP
    IF (m.blocks -> i ->> 'chapter_id') = p_chapter_id::TEXT
       AND COALESCE(m.blocks -> i -> 'progress' ->> 'status', 'pending') <> 'done' THEN
      matched_block_id := m.blocks -> i ->> 'id';
      EXIT;
    END IF;
  END LOOP;

  IF matched_block_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_matching_block');
  END IF;

  RETURN public.bump_mission_block_progress(m.id, matched_block_id, p_is_correct, p_question_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.bump_mission_progress_by_chapter(UUID, BOOLEAN, UUID) TO authenticated;
