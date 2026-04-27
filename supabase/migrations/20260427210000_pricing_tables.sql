-- Campaign brief generation tracking (rate limiting)
CREATE TABLE IF NOT EXISTS public.campaign_brief_generations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  source_url text,
  brief_jsonb jsonb,
  ip_address inet,
  generated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_brief_gen_org ON public.campaign_brief_generations (org_id, generated_at DESC);
CREATE INDEX idx_brief_gen_ip ON public.campaign_brief_generations (ip_address, generated_at DESC);

ALTER TABLE public.campaign_brief_generations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members read own generations"
  ON public.campaign_brief_generations FOR SELECT
  TO authenticated
  USING (org_id IN (
    SELECT om.org_id FROM org_members om WHERE om.user_id = auth.uid()
  ) OR user_id = auth.uid());

CREATE POLICY "Authenticated users insert"
  ON public.campaign_brief_generations FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Service role full access"
  ON public.campaign_brief_generations FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- Campaign templates (brand sponsored library)
CREATE TABLE IF NOT EXISTS public.campaign_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL,
  category text NOT NULL CHECK (category IN (
    'product_launch', 'seasonal', 'ugc', 'brand_awareness', 'event'
  )),
  template_data jsonb NOT NULL DEFAULT '{}',
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.campaign_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read templates"
  ON public.campaign_templates FOR SELECT
  USING (is_active = true);

CREATE POLICY "Service role manages templates"
  ON public.campaign_templates FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- Seed 5 templates
INSERT INTO public.campaign_templates (title, description, category, template_data, display_order) VALUES
  ('Product Launch UGC', 'User-generated content to launch a new product with authentic creator voices.', 'product_launch',
   '{"content_types":["short_video","photo_carousel"],"platforms":["instagram","tiktok"],"budget_range":{"min":500,"max":2000},"timeline_days":14,"deliverables_count":3}'::jsonb, 1),
  ('Seasonal Promo', 'Holiday or seasonal content push to drive foot traffic and online orders.', 'seasonal',
   '{"content_types":["short_video","story"],"platforms":["instagram","tiktok"],"budget_range":{"min":300,"max":1500},"timeline_days":7,"deliverables_count":2}'::jsonb, 2),
  ('UGC Collection', 'Collect authentic user-generated content for your brand library.', 'ugc',
   '{"content_types":["photo","short_video"],"platforms":["instagram"],"budget_range":{"min":200,"max":1000},"timeline_days":21,"deliverables_count":5}'::jsonb, 3),
  ('Brand Awareness', 'Long-term storytelling campaign to build brand recognition with creators.', 'brand_awareness',
   '{"content_types":["long_video","blog_post","photo_carousel"],"platforms":["youtube","instagram","tiktok"],"budget_range":{"min":1000,"max":5000},"timeline_days":30,"deliverables_count":4}'::jsonb, 4),
  ('Event Coverage', 'Same-day creator content from your event, launch party, or pop-up.', 'event',
   '{"content_types":["short_video","story","photo"],"platforms":["instagram","tiktok"],"budget_range":{"min":500,"max":3000},"timeline_days":3,"deliverables_count":3}'::jsonb, 5);

-- Pricing funnel analytics
CREATE TABLE IF NOT EXISTS public.pricing_funnel_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  feature_key text NOT NULL,
  current_tier text NOT NULL,
  required_tier text NOT NULL,
  action text NOT NULL CHECK (action IN ('viewed', 'clicked_upgrade', 'dismissed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pricing_funnel ON public.pricing_funnel_events (feature_key, action, created_at);

ALTER TABLE public.pricing_funnel_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users insert own events"
  ON public.pricing_funnel_events FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Service role full access"
  ON public.pricing_funnel_events FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);
