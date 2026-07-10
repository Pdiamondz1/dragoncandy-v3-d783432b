-- Let an INVITED (not-yet-active) creator read their own pending crew invitations
-- WITH the crew + business name. The creator_groups SELECT policy is members-only
-- (cg_member_select = is_active_group_member), so an invited creator cannot read the
-- group row directly. This SECURITY DEFINER function is gated on m.creator_id = auth.uid(),
-- so a caller only ever sees THEIR OWN pending invites (the "cross-visibility gated on
-- the caller's own anchor" pattern). Not anon-reachable -> full revoke.
CREATE OR REPLACE FUNCTION public.get_creator_pending_group_invitations()
RETURNS TABLE (
  id uuid,
  group_id uuid,
  group_name text,
  owner_id uuid,
  business_name text,
  owner_avatar_url text,
  invited_at timestamptz
)
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT m.id, m.group_id, g.name, g.owner_id, bp.business_name, p.avatar_url, m.invited_at
  FROM public.creator_group_members m
  JOIN public.creator_groups g ON g.id = m.group_id
  LEFT JOIN public.business_profiles bp ON bp.user_id = g.owner_id
  LEFT JOIN public.profiles p ON p.id = g.owner_id
  WHERE m.creator_id = auth.uid() AND m.status = 'invited'
  ORDER BY m.invited_at DESC;
$$;

REVOKE EXECUTE ON FUNCTION public.get_creator_pending_group_invitations() FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.get_creator_pending_group_invitations() TO authenticated;
