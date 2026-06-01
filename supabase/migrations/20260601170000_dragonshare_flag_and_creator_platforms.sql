-- (#1) Business "Report"/flag was a direct client UPDATE, but there is no org
-- UPDATE RLS policy on dragonshare_posts (only creators can update their rows),
-- so a business flag matched 0 rows — silent no-op, moderation broken.
-- Provide a security-definer RPC that checks org membership.
create or replace function flag_dragonshare_post(p_post_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
begin
  select target_org_id into v_org_id
  from dragonshare_posts where id = p_post_id;

  if v_org_id is null then
    raise exception 'Post not found';
  end if;

  if not exists (
    select 1 from org_members
    where org_id = v_org_id
      and user_id = auth.uid()
      and role in ('owner', 'admin')
      and invitation_status = 'active'
  ) then
    raise exception 'Only org owners or admins can report posts';
  end if;

  update dragonshare_posts
    set flagged_at = now(), flagged_by = auth.uid()
    where id = p_post_id and flagged_at is null;
end;
$$;

grant execute on function flag_dragonshare_post(uuid) to authenticated;

-- (#2) Creator's connected platforms can't be read by a business viewer
-- (business_outstand_accounts SELECT RLS is user_id = auth.uid()), so the boost
-- reach preview never showed the creator's platforms. Security-definer resolver,
-- column-safe (platform + handle only).
create or replace function get_creator_connected_platforms(p_creator_id uuid)
returns table (platform text, platform_handle text)
language sql
security definer
set search_path = public
stable
as $$
  select distinct boa.platform, boa.platform_handle
  from business_outstand_accounts boa
  where boa.user_id = p_creator_id
    and boa.status = 'active';
$$;

grant execute on function get_creator_connected_platforms(uuid) to authenticated;
