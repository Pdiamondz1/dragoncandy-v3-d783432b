CREATE POLICY cg_owner_all ON public.creator_groups
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY cg_member_select ON public.creator_groups
  FOR SELECT USING (public.is_active_group_member(id, auth.uid()));

CREATE POLICY cgm_owner_all ON public.creator_group_members
  FOR ALL USING (public.is_creator_group_owner(group_id, auth.uid()))
  WITH CHECK (public.is_creator_group_owner(group_id, auth.uid()));
CREATE POLICY cgm_self_select ON public.creator_group_members
  FOR SELECT USING (creator_id = auth.uid());
