
REVOKE EXECUTE ON FUNCTION public.award_mission_points(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.claim_daily_vault() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.sign_contract(integer, integer, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_contract_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.award_mission_points(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_daily_vault() TO authenticated;
GRANT EXECUTE ON FUNCTION public.sign_contract(integer, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_contract_status() TO authenticated;
