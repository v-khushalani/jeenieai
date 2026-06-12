-- Add moderation pipeline fields for educator content uploads.
ALTER TABLE public.educator_content
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS review_notes text,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'educator_content_approval_status_check'
  ) THEN
    ALTER TABLE public.educator_content
      ADD CONSTRAINT educator_content_approval_status_check
      CHECK (approval_status IN ('pending', 'approved', 'rejected'));
  END IF;
END $$;

UPDATE public.educator_content
SET submitted_at = COALESCE(submitted_at, created_at, now())
WHERE submitted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_educator_content_approval_status
  ON public.educator_content (approval_status);

CREATE INDEX IF NOT EXISTS idx_educator_content_submitted_at
  ON public.educator_content (submitted_at DESC);
