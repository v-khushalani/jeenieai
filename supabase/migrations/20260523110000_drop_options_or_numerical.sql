-- Drop restrictive check constraint that blocks HF imports
-- Reversible: you can re-add a stricter constraint after import if needed
ALTER TABLE public.questions DROP CONSTRAINT IF EXISTS options_or_numerical;
-- Also drop any similarly named constraint
ALTER TABLE public.questions DROP CONSTRAINT IF EXISTS options_or_numerical_check;
