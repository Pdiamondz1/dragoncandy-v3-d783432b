-- Soft-decline for DragonShare posts (business "Pass"). Additive only.
alter table dragonshare_posts add column if not exists declined_at timestamptz;
alter table dragonshare_posts add column if not exists declined_by uuid references auth.users(id);

create or replace function decline_dragonshare_post(p_post_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post record;
begin
  select id, target_org_id, boost_status, declined_at, creator_id
  into v_post
  from dragonshare_posts
  where id = p_post_id
  for update;

  if v_post is null then
    raise exception 'Post not found';
  end if;

  if not exists (
    select 1 from org_members
    where org_id = v_post.target_org_id
      and user_id = auth.uid()
      and role in ('owner', 'admin')
      and invitation_status = 'active'
  ) then
    raise exception 'Only org owners or admins can pass on posts';
  end if;

  if v_post.boost_status = 'boosted' then
    raise exception 'Post already boosted; cannot pass';
  end if;
  -- guard in-flight boosts (Stripe checkout open / off-session PI mid-flight):
  if exists (
    select 1 from dragonshare_boosts
    where post_id = p_post_id and status in ('pending', 'captured')
  ) then
    raise exception 'A boost is in progress; cannot pass';
  end if;
  if v_post.declined_at is not null then
    return; -- idempotent
  end if;

  update dragonshare_posts
    set declined_at = now(), declined_by = auth.uid()
    where id = p_post_id;

  insert into dragonshare_events (event_type, actor_user_id, actor_org_id, post_id, payload)
  values ('post_declined', auth.uid(), v_post.target_org_id, p_post_id, '{}'::jsonb);
end;
$$;

grant execute on function decline_dragonshare_post(uuid) to authenticated;
