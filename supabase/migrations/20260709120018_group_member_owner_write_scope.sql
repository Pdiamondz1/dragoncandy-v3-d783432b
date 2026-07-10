-- P2 fix (Codex): the cgm_owner_all FOR ALL policy let a group owner write
-- creator_group_members.status='active' directly (via the client), bypassing the
-- invite -> creator-accept consent flow — a business could force creators into a crew
-- without consent and then post them private campaigns. Split owner writes so the owner
-- can only create/re-invite 'invited' rows and set 'removed'; activation ('active') and
-- 'declined' happen ONLY through respond_to_group_invitation (SECURITY DEFINER, called by
-- the creator). Creator self-SELECT (cgm_self_select) is unchanged.
DROP POLICY IF EXISTS cgm_owner_all ON public.creator_group_members;

CREATE POLICY cgm_owner_select ON public.creator_group_members
  FOR SELECT USING (public.is_creator_group_owner(group_id, auth.uid()));

CREATE POLICY cgm_owner_insert ON public.creator_group_members
  FOR INSERT
  WITH CHECK (public.is_creator_group_owner(group_id, auth.uid()) AND status = 'invited');

CREATE POLICY cgm_owner_update ON public.creator_group_members
  FOR UPDATE
  USING (public.is_creator_group_owner(group_id, auth.uid()))
  WITH CHECK (public.is_creator_group_owner(group_id, auth.uid()) AND status IN ('invited', 'removed'));
