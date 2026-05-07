-- Security fix #17: Hourly rate limiting for LLM endpoints
CREATE TABLE IF NOT EXISTS public.llm_hourly_usage (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hour_bucket timestamptz NOT NULL,
  call_count int NOT NULL DEFAULT 1,
  updated_at timestamptz DEFAULT now(),
  UNIQUE (user_id, hour_bucket)
);

ALTER TABLE public.llm_hourly_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "llm_hourly_usage: service role only"
ON public.llm_hourly_usage FOR ALL
TO authenticated
USING (false)
WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.increment_llm_hourly_usage(
  p_user_id uuid,
  p_hour_bucket timestamptz
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  INSERT INTO public.llm_hourly_usage (user_id, hour_bucket, call_count)
  VALUES (p_user_id, p_hour_bucket, 1)
  ON CONFLICT (user_id, hour_bucket)
  DO UPDATE SET call_count = llm_hourly_usage.call_count + 1,
               updated_at = now();
$$;

CREATE INDEX idx_llm_hourly_usage_bucket ON public.llm_hourly_usage (hour_bucket);
