-- Campaign skip tracking for swipe undo + cycling
CREATE TABLE IF NOT EXISTS public.campaign_skips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  skipped_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  restored BOOLEAN NOT NULL DEFAULT false,
  UNIQUE(user_id, campaign_id)
);

ALTER TABLE public.campaign_skips ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own skips" ON public.campaign_skips;
CREATE POLICY "Users can manage their own skips"
  ON public.campaign_skips
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_campaign_skips_user ON public.campaign_skips(user_id);
CREATE INDEX IF NOT EXISTS idx_campaign_skips_campaign ON public.campaign_skips(campaign_id);
