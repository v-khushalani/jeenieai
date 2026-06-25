
CREATE OR REPLACE FUNCTION public.recalc_user_accuracy()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_user_id uuid;
  v_total bigint;
  v_correct bigint;
  v_accuracy numeric;
BEGIN
  target_user_id := COALESCE(NEW.user_id, OLD.user_id);
  IF target_user_id IS NULL THEN RETURN NULL; END IF;

  SELECT COUNT(*), COUNT(*) FILTER (WHERE is_correct = true)
  INTO v_total, v_correct
  FROM public.question_attempts
  WHERE user_id = target_user_id
    AND mode = 'practice'
    AND is_correct IS NOT NULL;

  IF v_total = 0 THEN
    v_accuracy := 0;
  ELSE
    v_accuracy := ROUND((v_correct::numeric / v_total::numeric) * 100, 2);
  END IF;

  UPDATE public.profiles
  SET overall_accuracy = v_accuracy,
      total_questions_solved = v_total,
      updated_at = now()
  WHERE id = target_user_id;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS question_attempts_accuracy_trigger ON public.question_attempts;
CREATE TRIGGER question_attempts_accuracy_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.question_attempts
FOR EACH ROW
EXECUTE FUNCTION public.recalc_user_accuracy();

-- One-time backfill
UPDATE public.profiles p
SET overall_accuracy = sub.accuracy,
    total_questions_solved = sub.total,
    updated_at = now()
FROM (
  SELECT user_id,
         COUNT(*) AS total,
         ROUND((COUNT(*) FILTER (WHERE is_correct = true)::numeric / NULLIF(COUNT(*), 0)) * 100, 2) AS accuracy
  FROM public.question_attempts
  WHERE mode = 'practice' AND is_correct IS NOT NULL
  GROUP BY user_id
) sub
WHERE p.id = sub.user_id;
