DROP POLICY IF EXISTS "authenticated read public profile fields" ON public.profiles;
ALTER VIEW public.my_profile SET (security_invoker = true);