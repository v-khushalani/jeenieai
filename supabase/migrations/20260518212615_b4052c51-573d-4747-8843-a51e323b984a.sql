INSERT INTO public.feature_flags (flag_key, label, description, is_enabled, rollout_percentage, category) VALUES
('leaderboard','Leaderboard','Show student leaderboard and rankings',true,100,'engagement'),
('badges','Badges & Achievements','Achievement badges for students',true,100,'engagement'),
('ai_doubt_solver','AI Doubt Solver','AI-powered doubt resolution (floating Jeenie button)',true,100,'ai'),
('study_planner','AI Study Planner','Personalised AI study plan generation',true,100,'ai'),
('push_notifications','Push Notifications','Browser push notifications for reminders',true,100,'engagement'),
('referral_system','Referral System','Student referral and invite system',true,100,'growth'),
('pyq_explorer','PYQ Explorer','Previous year question paper explorer',true,100,'content'),
('test_mode','Test Mode','Timed test and mock exam feature',true,100,'content'),
('educator_content','Educator Content','Allow educators to upload study material',true,100,'content'),
('pricing_plans','Pricing Plans','Subscription and pricing page',true,100,'monetization'),
('streak_tracking','Streak Tracking','Daily study streak tracker',true,100,'engagement'),
('gamification','Gamification','Points, XP, and level-up system',true,100,'engagement'),
('live_notifications','Live Notifications','Real-time notification banners',true,100,'engagement'),
('group_tests','Group Tests','Create and join group tests',true,100,'engagement'),
('jeenie_chat','Jeenie AI Chat','Floating Jeenie chat assistant',true,100,'ai')
ON CONFLICT (flag_key) DO NOTHING;