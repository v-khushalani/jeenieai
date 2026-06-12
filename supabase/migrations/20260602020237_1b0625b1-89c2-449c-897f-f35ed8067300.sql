
-- Admin-only RPC to fetch profiles with PII (email/phone). Required because
-- direct SELECT on profiles.email/phone is revoked from authenticated.
CREATE OR REPLACE FUNCTION public.admin_list_profiles()
RETURNS TABLE (
  id uuid,
  email text,
  full_name text,
  phone text,
  created_at timestamptz,
  grade integer,
  target_exam text,
  is_premium boolean,
  subscription_end_date timestamptz,
  subscription_tier text,
  subscription_status text,
  subscription_plan text,
  educator_approved boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'super_admin'::app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
    SELECT p.id, p.email, p.full_name, p.phone, p.created_at, p.grade, p.target_exam,
           p.is_premium, p.subscription_end_date, p.subscription_tier,
           p.subscription_status, p.subscription_plan, p.educator_approved
    FROM public.profiles p
    ORDER BY p.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_profiles() TO authenticated;

-- Admin-only lookup by user ids (used by reports/notifications)
CREATE OR REPLACE FUNCTION public.admin_get_profiles_by_ids(p_user_ids uuid[])
RETURNS TABLE (id uuid, full_name text, email text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'super_admin'::app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
    SELECT p.id, p.full_name, p.email
    FROM public.profiles p
    WHERE p.id = ANY(p_user_ids);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_profiles_by_ids(uuid[]) TO authenticated;
