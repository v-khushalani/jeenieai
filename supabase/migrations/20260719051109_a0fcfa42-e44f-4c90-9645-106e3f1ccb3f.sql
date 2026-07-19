
-- Delete leftover free@jeenie.test (not in current spec)
DELETE FROM public.user_roles WHERE user_id IN (SELECT id FROM auth.users WHERE email = 'free@jeenie.test');
DELETE FROM public.profiles WHERE email = 'free@jeenie.test' OR id IN (SELECT id FROM auth.users WHERE email='free@jeenie.test');
DELETE FROM auth.users WHERE email = 'free@jeenie.test';

-- Delete orphan profiles whose auth user was already removed (old @j.test set)
DELETE FROM public.profiles WHERE id NOT IN (SELECT id FROM auth.users);
