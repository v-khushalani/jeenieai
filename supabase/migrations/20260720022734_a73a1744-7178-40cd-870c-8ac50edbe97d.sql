
-- 1) Admin can update any profile (fixes educator_approved toggle)
DROP POLICY IF EXISTS "admins update any profile" ON public.profiles;
CREATE POLICY "admins update any profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

-- 2) Storage policies for educator-content bucket
DROP POLICY IF EXISTS "educator-content read authenticated" ON storage.objects;
DROP POLICY IF EXISTS "educator-content insert own" ON storage.objects;
DROP POLICY IF EXISTS "educator-content update own or admin" ON storage.objects;
DROP POLICY IF EXISTS "educator-content delete own or admin" ON storage.objects;

CREATE POLICY "educator-content read authenticated"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'educator-content');

CREATE POLICY "educator-content insert own"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'educator-content'
    AND (
      public.has_role(auth.uid(), 'educator')
      OR public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'super_admin')
    )
  );

CREATE POLICY "educator-content update own or admin"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'educator-content'
    AND (
      owner = auth.uid()
      OR public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'super_admin')
    )
  );

CREATE POLICY "educator-content delete own or admin"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'educator-content'
    AND (
      owner = auth.uid()
      OR public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'super_admin')
    )
  );
