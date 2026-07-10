-- P2 fix (Codex round 3): can_create_application is the RLS WITH CHECK for DIRECT
-- campaign_applications inserts (the path that bypasses the apply_to_campaign RPC). Its
-- group-member branch only checked membership, so an active crew member who knows a
-- group campaign id could insert an application directly while the campaign is draft/
-- active. Add the same status = 'published' predicate to the membership branch (matching
-- the RPC guard and the public branch); the pending-invitation branch is preserved so an
-- explicitly invited creator may still apply to a non-published campaign.
CREATE OR REPLACE FUNCTION public.can_create_application(p_campaign_id uuid, p_creator_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = p_creator_id AND role = 'content_creator')
    AND (
      EXISTS (SELECT 1 FROM public.campaigns
              WHERE id = p_campaign_id AND status = 'published' AND group_id IS NULL)
      OR EXISTS (SELECT 1 FROM public.campaigns c
              WHERE c.id = p_campaign_id AND c.group_id IS NOT NULL
                AND c.status = 'published'
                AND public.is_active_group_member(c.group_id, p_creator_id))
      OR EXISTS (SELECT 1 FROM public.campaign_invitations
              WHERE campaign_id = p_campaign_id AND creator_id = p_creator_id AND status = 'pending')
    )
  );
$$;
