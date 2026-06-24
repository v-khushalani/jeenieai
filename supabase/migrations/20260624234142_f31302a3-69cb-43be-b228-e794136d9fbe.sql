CREATE TABLE IF NOT EXISTS public.ai_request_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  tier text NOT NULL,
  mode text NOT NULL,
  mode_source text NOT NULL DEFAULT 'auto',
  model text NOT NULL,
  input_tokens int,
  output_tokens int,
  latency_ms int,
  estimated_cost_inr numeric(10,4),
  had_image boolean NOT NULL DEFAULT false,
  fallback_used text,
  subject text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ai_request_log TO authenticated;
GRANT ALL ON public.ai_request_log TO service_role;

ALTER TABLE public.ai_request_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own ai logs"
  ON public.ai_request_log
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "admins read all ai logs"
  ON public.ai_request_log
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_ai_request_log_user_created
  ON public.ai_request_log (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_request_log_created
  ON public.ai_request_log (created_at DESC);