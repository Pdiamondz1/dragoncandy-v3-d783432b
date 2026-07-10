-- Crews Phase 2 — Task 1: crew_activity feed table + RLS.
-- Private per-crew activity feed. Clients SELECT only; all writes go through the
-- forge-proof record_crew_activity RPC (see the sibling migration). No client
-- INSERT/UPDATE/DELETE policy is defined, so RLS denies direct writes by default.
CREATE TABLE public.crew_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.creator_groups(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES public.profiles(id),
  participant_id uuid REFERENCES public.profiles(id),
  event_type text NOT NULL CHECK (event_type IN
    ('campaign_posted','application_received','hired','content_submitted',
     'content_approved','revision_requested','completed')),
  visibility text NOT NULL CHECK (visibility IN ('business','crew')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_crew_activity_group ON public.crew_activity(group_id, created_at DESC);
CREATE INDEX idx_crew_activity_participant ON public.crew_activity(participant_id) WHERE participant_id IS NOT NULL;

ALTER TABLE public.crew_activity ENABLE ROW LEVEL SECURITY;

-- SELECT-only for clients (no client INSERT/UPDATE/DELETE policy — writes go through the RPC).
CREATE POLICY crew_activity_owner_select ON public.crew_activity
  FOR SELECT USING (public.is_creator_group_owner(group_id, auth.uid()));
CREATE POLICY crew_activity_creator_select ON public.crew_activity
  FOR SELECT USING (
    (visibility = 'crew' AND public.is_active_group_member(group_id, auth.uid()))
    OR participant_id = auth.uid()
  );
