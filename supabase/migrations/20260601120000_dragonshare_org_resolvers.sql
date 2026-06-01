-- DragonShare resolvers: bridge organizations.id <-> business_profiles.id.
-- Owner mapping canonical source: org_members (role='owner', active).

-- 1) Public-safe org name/logo resolver (fixes creator "Unknown org").
create or replace function resolve_dragonshare_orgs(p_org_ids uuid[])
returns table (id uuid, name text, logo_url text, org_type text)
language sql
security definer
set search_path = public
stable
as $$
  select o.id, o.name, o.logo_url, o.org_type
  from organizations o
  where o.id = any(p_org_ids)
    and o.deleted_at is null;
$$;

grant execute on function resolve_dragonshare_orgs(uuid[]) to authenticated;

-- 2) Connected social platforms for an org (fixes "Connect social accounts").
create or replace function get_org_connected_platforms(p_org_id uuid)
returns table (platform text, platform_handle text)
language sql
security definer
set search_path = public
stable
as $$
  select distinct boa.platform, boa.platform_handle
  from org_members om
  join business_profiles bp on bp.user_id = om.user_id
  join business_outstand_accounts boa on boa.business_id = bp.id
  where om.org_id = p_org_id
    and om.role = 'owner'
    and om.invitation_status = 'active'
    and boa.status = 'active';
$$;

grant execute on function get_org_connected_platforms(uuid) to authenticated;
