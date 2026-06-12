-- Auto-hide questions when reported (any user report disables the question for everyone)
-- Trigger sets questions.is_active = false on first report so reported questions stop appearing
-- to all users. Admins can re-enable via admin tools.

CREATE OR REPLACE FUNCTION public.handle_question_report_hide()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only hide if currently active. Skip if already inactive (no-op).
  UPDATE public.questions
  SET is_active = false,
      updated_at = now()
  WHERE id = NEW.question_id
    AND is_active = true;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hide_question_on_report ON public.question_reports;

CREATE TRIGGER trg_hide_question_on_report
AFTER INSERT ON public.question_reports
FOR EACH ROW
EXECUTE FUNCTION public.handle_question_report_hide();