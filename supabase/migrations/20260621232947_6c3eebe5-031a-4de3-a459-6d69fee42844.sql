
GRANT SELECT ON public.subscription_plans TO anon;
GRANT SELECT ON public.subscription_plans TO authenticated;
GRANT ALL ON public.subscription_plans TO service_role;

UPDATE public.subscription_plans SET features = '["Unlimited practice questions","Unlimited mock tests","AI Doubt Solver (limited)","AI Study Planner","Advanced analytics"]'::jsonb WHERE id = 'pro_monthly';

UPDATE public.subscription_plans SET features = '["Unlimited practice questions","Unlimited mock tests","AI Doubt Solver (limited)","AI Study Planner","Advanced analytics","Save 58% vs monthly"]'::jsonb WHERE id = 'pro_yearly';

UPDATE public.subscription_plans SET features = '["Everything in Pro","Unlimited AI Doubt Solver","AI Rank Predictor","Adaptive AI Study Planner","Educator PPTs & Interactive Animations","Battle Mode access"]'::jsonb WHERE id = 'pro_plus_monthly';

UPDATE public.subscription_plans SET features = '["Everything in Pro+","Unlimited AI Doubt Solver","AI Rank Predictor","Adaptive AI Study Planner","Educator PPTs & Interactive Animations","Battle Mode access","Save 54% vs monthly"]'::jsonb WHERE id = 'pro_plus_yearly';
