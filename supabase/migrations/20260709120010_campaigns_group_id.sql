-- Phase 2 — Group-scoped private campaigns.
-- Add a nullable group_id to campaigns marking a campaign as private to a creator group.
-- ON DELETE RESTRICT is load-bearing: SET NULL would silently make a private
-- group campaign public. Do not change it.
-- Existing rows all have group_id IS NULL, so this is a no-op for them.

ALTER TABLE public.campaigns
  ADD COLUMN group_id uuid REFERENCES public.creator_groups(id) ON DELETE RESTRICT;

CREATE INDEX idx_campaigns_group_id ON public.campaigns(group_id) WHERE group_id IS NOT NULL;
