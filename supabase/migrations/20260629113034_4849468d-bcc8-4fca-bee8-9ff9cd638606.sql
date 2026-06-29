-- Remove daily missions feature completely
DROP TRIGGER IF EXISTS trg_advance_daily_mission ON public.question_attempts;
DROP FUNCTION IF EXISTS public.advance_daily_mission() CASCADE;
DROP FUNCTION IF EXISTS public.get_or_create_today_mission(jsonb) CASCADE;
DROP FUNCTION IF EXISTS public.reset_today_mission() CASCADE;

-- Remove from realtime publication if present
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'daily_missions'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.daily_missions;
  END IF;
END $$;

DROP TABLE IF EXISTS public.daily_missions CASCADE;