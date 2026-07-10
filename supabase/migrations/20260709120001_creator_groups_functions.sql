CREATE OR REPLACE FUNCTION public.is_active_group_member(p_group_id uuid, p_creator_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.creator_group_members m
    WHERE m.group_id = p_group_id AND m.creator_id = p_creator_id AND m.status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_creator_group_owner(p_group_id uuid, p_user_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.creator_groups g
    WHERE g.id = p_group_id AND g.owner_id = p_user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.respond_to_group_invitation(p_group_id uuid, p_accept boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.creator_group_members
     SET status = CASE WHEN p_accept THEN 'active' ELSE 'declined' END,
         responded_at = now(), updated_at = now()
   WHERE group_id = p_group_id AND creator_id = auth.uid() AND status = 'invited';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No pending group invitation';
  END IF;
END;
$$;

-- GRANT/REVOKE discipline (spec §5):
-- is_active_group_member is used inside the anon-reachable campaigns SELECT policy (Phase 2) --
--   do NOT revoke from anon; just grant authenticated (default anon grant stays).
GRANT EXECUTE ON FUNCTION public.is_active_group_member(uuid, uuid) TO authenticated;
-- The other two are NOT anon-reachable -- full revoke + grant authenticated.
REVOKE EXECUTE ON FUNCTION public.is_creator_group_owner(uuid, uuid) FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.is_creator_group_owner(uuid, uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.respond_to_group_invitation(uuid, boolean) FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.respond_to_group_invitation(uuid, boolean) TO authenticated;
