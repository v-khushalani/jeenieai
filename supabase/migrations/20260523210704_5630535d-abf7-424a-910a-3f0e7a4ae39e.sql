
-- 1. educator_content: tighten SELECT
DROP POLICY IF EXISTS "Authenticated read educator content" ON public.educator_content;

CREATE POLICY "Educator content visible to entitled users"
ON public.educator_content
FOR SELECT
TO authenticated
USING (
  is_active = true AND (
    uploaded_by = auth.uid()
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'educator'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.chapters c
      WHERE c.id = educator_content.chapter_id
        AND (
          c.is_free = true
          OR EXISTS (
            SELECT 1 FROM public.user_batch_subscriptions ubs
            WHERE ubs.user_id = auth.uid()
              AND ubs.batch_id = c.batch_id
              AND ubs.status = 'active'
              AND (ubs.expires_at IS NULL OR ubs.expires_at > now())
          )
        )
    )
  )
);

-- 2. payments: remove client INSERT (edge functions use service role)
DROP POLICY IF EXISTS "Users can insert own payments" ON public.payments;

-- 3. log_points: revoke from authenticated
DO $$ BEGIN
  EXECUTE 'REVOKE EXECUTE ON FUNCTION public.log_points(uuid, integer, text, text, uuid) FROM authenticated, anon, public';
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN
  EXECUTE 'REVOKE EXECUTE ON FUNCTION public.log_points(uuid, integer, text, text) FROM authenticated, anon, public';
EXCEPTION WHEN undefined_function THEN NULL; END $$;

-- 4. handle_question_report_hide: trigger-only
DO $$ BEGIN
  EXECUTE 'REVOKE EXECUTE ON FUNCTION public.handle_question_report_hide() FROM authenticated, anon, public';
EXCEPTION WHEN undefined_function THEN NULL; END $$;

-- 5. get_chapter_difficulty_distribution: revoke from anon
DO $$ BEGIN
  EXECUTE 'REVOKE EXECUTE ON FUNCTION public.get_chapter_difficulty_distribution(uuid) FROM anon';
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN
  EXECUTE 'REVOKE EXECUTE ON FUNCTION public.get_chapter_difficulty_distribution() FROM anon';
EXCEPTION WHEN undefined_function THEN NULL; END $$;
