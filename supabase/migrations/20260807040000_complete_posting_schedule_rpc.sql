-- Atomic "is this campaign's posting schedule finished?" check-and-set.
--
-- WHY. outstand-webhook marks a post published, then READS the campaign's
-- sibling rows in JavaScript and updates the campaign if all are published.
-- Read-then-write across two statements has a window: when the LAST TWO posts
-- of a campaign are published by webhooks running concurrently, each can read
-- the siblings before the other's row update commits, both see one still
-- pending, and BOTH skip. Since those were the last two, no later webhook ever
-- re-evaluates and the campaign stays on "scheduled" forever — the same stuck
-- state the whole change set out to fix.
--
-- Folding the condition INTO the UPDATE removes the JS window: the NOT EXISTS
-- is evaluated by the same statement that writes, under one snapshot.
--
-- Residual, stated because it is not zero: two statements starting before
-- either commits can still both see a pending sibling. The window shrinks from
-- "two network round trips" to "one statement", and reconcile-social-posts
-- re-drives the same call hourly, so a campaign that loses the race is
-- corrected within the hour rather than permanently.
--
-- Rules encoded here mirror _shared/schedule-completion.ts exactly, because two
-- implementations of one rule is how they drift:
--   * only advances from 'scheduled' / 'in_progress' — never backwards out of
--     'failed', never skipping earlier lifecycle states;
--   * 'cancelled' rows are ignored, so a cancellation cannot hold a schedule
--     open forever;
--   * a FAILED row counts as pending — "All Posts Published" is false while one
--     failed;
--   * a campaign with no non-cancelled rows is UNSCHEDULED, not complete.
--
-- p_user_id is required and both the campaign and its posts are matched on it:
-- donny_scheduled_posts.campaign_id is client-writable with nothing in its
-- INSERT policy constraining it, so without this a planted row could complete
-- somebody else's campaign. The caller passes the row's user_id, which the
-- INSERT policy pins to auth.uid() — see the pairing note in outstand-webhook.
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
       -- at least one real (non-cancelled) post: unscheduled is not "complete"
       and exists (
         select 1
           from public.donny_scheduled_posts p
          where p.campaign_id = p_campaign_id
            and p.user_id = p_user_id
            and coalesce(p.status, '') <> 'cancelled'
       )
       -- and none of them still outstanding (failed counts as outstanding)
       and not exists (
         select 1
           from public.donny_scheduled_posts p
          where p.campaign_id = p_campaign_id
            and p.user_id = p_user_id
            and coalesce(p.status, '') <> 'cancelled'
            and coalesce(p.status, '') <> 'published'
       )
    returning 1
  )
  select exists (select 1 from updated);
$$;

-- Service-role only. Same lockdown as every other SECURITY DEFINER in this
-- codebase: revoke the ambient grants, then grant back exactly one role. The
-- only callers are outstand-webhook and reconcile-social-posts, both of which
-- use the service key.
revoke all on function public.complete_posting_schedule_if_done(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.complete_posting_schedule_if_done(uuid, uuid)
  to service_role;

comment on function public.complete_posting_schedule_if_done(uuid, uuid) is
  'Atomically set campaigns.posting_schedule_status to ''completed'' when every non-cancelled donny_scheduled_posts row for (campaign, user) is published. Returns true only if THIS call made the transition. Service-role only; p_user_id is the cross-tenant guard because donny_scheduled_posts.campaign_id is client-writable. Mirrors _shared/schedule-completion.ts.';

-- Verification — EXPECTED: exactly one grantee, service_role.
--
--   select grantee, privilege_type
--   from information_schema.routine_privileges
--   where routine_schema = 'public'
--     and routine_name = 'complete_posting_schedule_if_done';
