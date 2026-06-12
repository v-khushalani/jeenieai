
INSERT INTO public.subscription_plans
  (id, name, tagline, tier, mrp_price, price, duration_days, display_duration, features, is_popular, is_best_value, is_active, display_order, razorpay_plan_id)
VALUES
  ('pro_monthly',     'JEEnie Pro',  'Unlimited practice & tests',           'pro',      499,   299,  30,  'per month',
    '["Unlimited practice questions","Unlimited mock tests","AI Doubt Solver (limited)","AI Study Planner","Advanced analytics","Email support"]'::jsonb,
    false, false, true, 10, NULL),
  ('pro_yearly',      'JEEnie Pro',  'Best value yearly plan',               'pro',      5988,  2499, 365, 'per year',
    '["Unlimited practice questions","Unlimited mock tests","AI Doubt Solver (limited)","AI Study Planner","Advanced analytics","Email support","Save 58% vs monthly"]'::jsonb,
    true,  false, true, 20, NULL),
  ('pro_plus_monthly','JEEnie Pro+', 'Everything in Pro + AI Coach',         'pro_plus', 899,   599,  30,  'per month',
    '["Everything in Pro","Unlimited AI Doubt Solver","AI Rank Predictor","Adaptive AI Study Planner","Educator PPTs & simulations","Battle Mode access","WhatsApp + Email support"]'::jsonb,
    false, false, true, 30, NULL),
  ('pro_plus_yearly', 'JEEnie Pro+', 'Top-tier yearly plan — save the most', 'pro_plus', 10788, 4999, 365, 'per year',
    '["Everything in Pro+","Unlimited AI Doubt Solver","AI Rank Predictor","Adaptive AI Study Planner","Educator PPTs & simulations","Battle Mode access","Priority WhatsApp support","Save 54% vs monthly"]'::jsonb,
    false, true,  true, 40, NULL)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.get_topic_question_counts(
  p_chapter_id uuid,
  p_batch_ids uuid[] DEFAULT NULL,
  p_exam text DEFAULT NULL
)
RETURNS TABLE(topic_id uuid, count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT topic_id, COUNT(*)::bigint
  FROM questions
  WHERE is_active = true
    AND chapter_id = p_chapter_id
    AND topic_id IS NOT NULL
    AND (p_batch_ids IS NULL OR cardinality(p_batch_ids) = 0 OR batch_id = ANY(p_batch_ids) OR batch_id IS NULL)
    AND (
      p_exam IS NULL
      OR (p_exam ILIKE '%jee%'  AND exam ILIKE '%jee%')
      OR (p_exam ILIKE '%neet%' AND exam ILIKE '%neet%')
      OR (p_exam NOT ILIKE '%jee%' AND p_exam NOT ILIKE '%neet%' AND exam = p_exam)
    )
  GROUP BY topic_id;
$$;
