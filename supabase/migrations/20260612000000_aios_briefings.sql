-- AIOS PR 7: weekly operating briefs. Written ONLY by the service-role
-- aios-report-ingest edge function (the report-only choke point); admins see
-- drafts and publish; stakeholders see published briefs only (publish gate,
-- decision #2/#6 in the AIOS spec).

CREATE TABLE IF NOT EXISTS public.aios_briefings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start date NOT NULL UNIQUE,
  title text NOT NULL,
  body_md text NOT NULL,
  kpis jsonb NOT NULL DEFAULT '[]',
  generated_by text NOT NULL DEFAULT 'weekly-brief-agent',
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.aios_briefings ENABLE ROW LEVEL SECURITY;

-- Admins see every briefing, including unpublished drafts pending review.
DROP POLICY IF EXISTS "aios_briefings_admin_select" ON public.aios_briefings;
CREATE POLICY "aios_briefings_admin_select" ON public.aios_briefings
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Stakeholders see only published briefings.
DROP POLICY IF EXISTS "aios_briefings_stakeholder_select" ON public.aios_briefings;
CREATE POLICY "aios_briefings_stakeholder_select" ON public.aios_briefings
  FOR SELECT TO authenticated
  USING (public.is_internal_user() AND published_at IS NOT NULL);

-- Admins publish/unpublish from the dashboard. No INSERT/DELETE policies:
-- content arrives via the service-role ingest function only.
DROP POLICY IF EXISTS "aios_briefings_admin_update" ON public.aios_briefings;
CREATE POLICY "aios_briefings_admin_update" ON public.aios_briefings
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER trg_aios_briefings_updated_at
  BEFORE UPDATE ON public.aios_briefings
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
