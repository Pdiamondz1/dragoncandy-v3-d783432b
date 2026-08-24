-- Recovered 2026-08-24 from production's migration ledger, which was the only
-- place this migration existed. Version 20260807055937 IS recorded on production.
-- This is a record of what ran, not a migration: see README.md in this directory.
-- Everything below the blank line is the ledger's SQL, verbatim.

-- 20260807040000_complete_posting_schedule_rpc.sql
-- Atomic check-and-set for "is this campaign's posting schedule finished?".
--
-- Read-then-write across two statements has a window: when the LAST TWO posts of
-- a campaign publish concurrently, each webhook can read the siblings before the
-- other's update commits, both see one pending, and BOTH skip -- and since those
-- were the last two, nothing ever re-evaluates. Folding the NOT EXISTS into the
-- UPDATE makes check and write share one snapshot.
--
-- p_user_id is the cross-tenant guard: donny_scheduled_posts.campaign_id is
-- client-writable with nothing in its INSERT policy constraining it, so without
-- this a planted row could complete somebody else's campaign.
create or replace function public.complete_posting_schedule_if_done(
  p_campaign_id uuid,
  p_user_id uuid
) returns boolean
language sql
security definer
set search_path = public
as $$
  with updated as (
    update public.campaigns c
       set posting_schedule_status = 'completed'
     where c.id = p_campaign_id
       and c.user_id = p_user_id
       and c.posting_schedule_status in ('scheduled', 'in_progress')
       and exists (
         select 1 from public.donny_scheduled_posts p
          where p.campaign_id = p_campaign_id
            and p.user_id = p_user_id
            and coalesce(p.status, '') <> 'cancelled'
       )
       and not exists (
         select 1 from public.donny_scheduled_posts p
          where p.campaign_id = p_campaign_id
            and p.user_id = p_user_id
            and coalesce(p.status, '') <> 'cancelled'
            and coalesce(p.status, '') <> 'published'
       )
    returning 1
  )
  select exists (select 1 from updated);
$$;

revoke all on function public.complete_posting_schedule_if_done(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.complete_posting_schedule_if_done(uuid, uuid)
  to service_role;

comment on function public.complete_posting_schedule_if_done(uuid, uuid) is
  'Atomically set campaigns.posting_schedule_status to ''completed'' when every non-cancelled donny_scheduled_posts row for (campaign, user) is published. Returns true only if THIS call made the transition. Service-role only; p_user_id is the cross-tenant guard because donny_scheduled_posts.campaign_id is client-writable.';
