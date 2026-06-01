-- Creator-facing DragonShare org resolver: show the clean business name
-- (e.g. "Harbormill") instead of the auto-generated org name
-- ("Harbormill's Workspace"). Falls back to the org name when no owner
-- business profile is found. Logo unchanged (org logo).
create or replace function resolve_dragonshare_orgs(p_org_ids uuid[])
returns table (id uuid, name text, logo_url text, org_type text)
language sql
security definer
set search_path = public
stable
as $$
  select
    o.id,
    coalesce(bp.business_name, o.name) as name,
    o.logo_url,
    o.org_type
  from organizations o
  left join lateral (
    select bp.business_name
    from org_members om
    join business_profiles bp on bp.user_id = om.user_id
    where om.org_id = o.id
      and om.role = 'owner'
      and om.invitation_status = 'active'
    limit 1
  ) bp on true
  where o.id = any(p_org_ids)
    and o.deleted_at is null;
$$;

grant execute on function resolve_dragonshare_orgs(uuid[]) to authenticated;
