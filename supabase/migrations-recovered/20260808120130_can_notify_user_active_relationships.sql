-- Recovered 2026-08-24 from production's migration ledger, which was the only
-- place this migration existed. Version 20260808120130 IS recorded on production.
-- This is a record of what ran, not a migration: see README.md in this directory.
-- Everything below the blank line is the ledger's SQL, verbatim.

create or replace function public.can_notify_user(p_actor uuid, p_recipient uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    p_actor is not null
    and p_recipient is not null
    and (
      p_actor = p_recipient
      or exists (
        select 1
        from campaigns c
        where (
                c.user_id = p_actor and (
                  exists (select 1 from campaign_applications a
                          where a.campaign_id = c.id and a.creator_id = p_recipient)
               or exists (select 1 from campaign_collaborations k
                          where k.campaign_id = c.id and k.creator_id = p_recipient)
               or exists (select 1 from campaign_invitations i
                          where i.campaign_id = c.id and i.creator_id = p_recipient)
                )
              )
           or (
                c.user_id = p_recipient and (
                  exists (select 1 from campaign_applications a
                          where a.campaign_id = c.id and a.creator_id = p_actor)
               or exists (select 1 from campaign_collaborations k
                          where k.campaign_id = c.id and k.creator_id = p_actor)
               or exists (select 1 from campaign_invitations i
                          where i.campaign_id = c.id and i.creator_id = p_actor)
                )
              )
      )
      -- Conversation: BOTH sides must still be in the thread. `left_at IS NULL` matches
      -- what the conversation RLS and RPCs already require; without it, someone who left
      -- a thread kept a permanent notification channel to the person they left.
      or exists (
        select 1
        from conversation_participants p1
        join conversation_participants p2 on p2.conversation_id = p1.conversation_id
        where p1.user_id = p_actor     and p1.left_at is null
          and p2.user_id = p_recipient and p2.left_at is null
      )
      or exists (
        select 1
        from creator_groups g
        join creator_group_members m on m.group_id = g.id
        where (g.owner_id = p_actor and m.creator_id = p_recipient)
           or (g.owner_id = p_recipient and m.creator_id = p_actor)
      )
      -- Org: membership must be ACTIVE on both sides. `org_members.invitation_status`
      -- also carries 'invited' and 'suspended', and every other policy filters on
      -- 'active' — a merely-invited or suspended member is not a colleague.
      or exists (
        select 1
        from org_members o1
        join org_members o2 on o2.org_id = o1.org_id
        where o1.user_id = p_actor     and o1.invitation_status = 'active'
          and o2.user_id = p_recipient and o2.invitation_status = 'active'
      )
      or exists (
        select 1
        from campaign_sponsorships s
        join business_profiles bb on bb.id = s.brand_id
        join business_profiles rb on rb.id = s.restaurant_id
        where (bb.user_id = p_actor     and rb.user_id = p_recipient)
           or (bb.user_id = p_recipient and rb.user_id = p_actor)
      )
    );
$$;

revoke execute on function public.can_notify_user(uuid, uuid) from public, anon, authenticated;
grant execute on function public.can_notify_user(uuid, uuid) to service_role;
