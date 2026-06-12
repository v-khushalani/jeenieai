
-- Drop the wide-open SELECT policy
DROP POLICY IF EXISTS "Educator content read for authenticated" ON storage.objects;

-- Replace with subscription/role-gated read policy
CREATE POLICY "Educator content read for entitled users"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'educator-content'
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'educator'::app_role)
    OR EXISTS (
      SELECT 1
      FROM public.educator_content ec
      LEFT JOIN public.chapters ch ON ch.id = ec.chapter_id
      LEFT JOIN public.batches b ON b.id = ch.batch_id
      LEFT JOIN public.user_batch_subscriptions sub
        ON sub.batch_id = ch.batch_id
       AND sub.user_id = auth.uid()
       AND sub.status = 'active'
       AND (sub.expires_at IS NULL OR sub.expires_at > now())
      WHERE ec.file_path = storage.objects.name
        AND ec.is_active = true
        AND (
          sub.id IS NOT NULL
          OR COALESCE(b.is_free, false) = true
          OR COALESCE(ch.is_free, false) = true
          OR ec.uploaded_by = auth.uid()
        )
    )
  )
);
