
CREATE OR REPLACE FUNCTION public.prevent_self_subscription_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_role text := current_setting('role', true);
  jwt_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
BEGIN
  -- Allow service_role (edge functions) and postgres/superuser to change anything
  IF jwt_role = 'service_role' OR current_role IN ('service_role','postgres') THEN
    RETURN NEW;
  END IF;

  -- For anon/authenticated, reject changes to subscription/premium columns
  IF NEW.is_premium IS DISTINCT FROM OLD.is_premium
     OR NEW.subscription_tier IS DISTINCT FROM OLD.subscription_tier
     OR NEW.subscription_plan IS DISTINCT FROM OLD.subscription_plan
     OR NEW.subscription_status IS DISTINCT FROM OLD.subscription_status
     OR NEW.subscription_end_date IS DISTINCT FROM OLD.subscription_end_date
  THEN
    RAISE EXCEPTION 'Not authorized to modify subscription fields'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_self_subscription_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_self_subscription_escalation
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_self_subscription_escalation();
