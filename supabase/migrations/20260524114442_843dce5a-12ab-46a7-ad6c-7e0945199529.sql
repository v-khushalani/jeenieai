
CREATE OR REPLACE FUNCTION public.increment_promo_redemption(p_promo_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.promo_codes
  SET current_redemptions = current_redemptions + 1
  WHERE id = p_promo_id;
$$;

REVOKE EXECUTE ON FUNCTION public.increment_promo_redemption(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_promo_redemption(uuid) TO service_role;
