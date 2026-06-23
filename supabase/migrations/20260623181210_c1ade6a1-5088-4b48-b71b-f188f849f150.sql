-- Fix admin visibility of question reports.
-- The table had no grants and the SELECT policy missed super_admin.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.question_reports TO authenticated;
GRANT ALL ON public.question_reports TO service_role;

DROP POLICY IF EXISTS "users view own reports" ON public.question_reports;
CREATE POLICY "users view own or admin reports"
  ON public.question_reports
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );
