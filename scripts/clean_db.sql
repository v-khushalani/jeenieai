-- Clean DB: truncate all tables in the public schema
-- except `profiles`. Does NOT touch the `auth` schema.
-- IMPORTANT: This is destructive. Make a backup before running.
-- Usage (example):
--   export DATABASE_URL="postgres://user:pass@host:5432/dbname"
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/clean_db.sql

DO $$
DECLARE
  r RECORD;
  keep TEXT[] := ARRAY['profiles']; -- tables in public to keep
BEGIN
  FOR r IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> ALL(keep)
  LOOP
    RAISE NOTICE 'Truncating public.%', r.tablename;
    EXECUTE format('TRUNCATE TABLE public.%I RESTART IDENTITY CASCADE;', r.tablename);
  END LOOP;
END$$;

-- Done.
