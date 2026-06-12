
-- Add Mathematics subject. The 'code' column is a USER-DEFINED enum (subject_code).
-- Add value to enum first if missing, then insert.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'subject_code' AND e.enumlabel = 'MATHEMATICS'
  ) THEN
    ALTER TYPE subject_code ADD VALUE 'MATHEMATICS';
  END IF;
END$$;
