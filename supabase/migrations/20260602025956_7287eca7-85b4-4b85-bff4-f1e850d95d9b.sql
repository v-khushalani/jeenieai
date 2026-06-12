-- Fix qa.pro: set tier='pro' with active subscription
UPDATE public.profiles
SET subscription_tier = 'pro',
    subscription_status = 'active',
    subscription_plan = 'pro_monthly',
    subscription_end_date = (now() + interval '30 days')
WHERE email = 'qa.pro@jeenieapp.test';

-- Fix qa.proplus: set tier='pro_plus' with active subscription
UPDATE public.profiles
SET subscription_tier = 'pro_plus',
    subscription_status = 'active',
    subscription_plan = 'pro_plus_monthly',
    subscription_end_date = (now() + interval '30 days'),
    is_premium = true
WHERE email = 'qa.proplus@jeenieapp.test';