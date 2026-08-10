-- can_notify_user: the crew clause required no membership status, so it was forgeable.
--
-- PROVEN ON PROD (2026-08-10, inside a rolled-back transaction, impersonating a real
-- business_client against an unrelated brand user):
--
--   baseline_can_notify = f   <- no relationship existed
--   crew_insert_ok      = t   <- created a crew as role `authenticated`
--   member_insert_ok    = t   <- named the unrelated victim, status='invited'
--   after_can_notify    = t   <- the gate now returned TRUE
--
-- Two INSERTs, no consent, any authenticated user to any user on the platform. Three
-- facts composed into it:
--
--   1. `creator_groups` INSERT policy `cg_owner_all` is WITH CHECK (owner_id = auth.uid()).
--      ANY authenticated user may create a crew -- no role check, no business requirement.
--   2. `creator_group_members` INSERT policy `cgm_owner_insert` is
--      WITH CHECK (is_creator_group_owner(group_id, auth.uid()) AND status = 'invited').
--      `creator_id` is entirely unconstrained -- the owner names whoever they like.
--   3. This clause joined `creator_group_members` with NO status filter at all.
--
-- The actor could not forge WHO the notification came from (`create-notification` derives
-- `actorId` from the JWT), but could choose the title, body and link on any of the 26
-- mapped notification types -- i.e. a DragonCandy-branded transactional email with
-- attacker-chosen copy, to anyone.
--
-- WHY `status = 'active'` IS THE RIGHT PREDICATE, AND IS NOT FORGEABLE.
--
-- An owner can never write 'active'. Verified against prod `pg_policies` and `pg_proc`:
--   * `cgm_owner_insert`  WITH CHECK pins status = 'invited'
--   * `cgm_owner_update`  WITH CHECK pins status IN ('invited','removed')
--   * there is NO self-UPDATE policy for the creator
--   * the ONLY writer of 'active' is `respond_to_group_invitation()` (SECURITY DEFINER),
--     whose UPDATE is gated `WHERE creator_id = auth.uid() AND status = 'invited'`
--   * the only trigger on the table is `handle_updated_at` -- nothing else touches status
--
-- So `status = 'active'` means THE CREATOR THEMSELVES ACCEPTED. It is a real consent
-- signal, which is exactly what a general-purpose notification channel should require.
-- The clause now reads honestly: a MUTUAL crew relationship.
--
-- WHAT THIS DELIBERATELY DOES NOT DO, AND WHY IT WOULD HAVE BEEN A REGRESSION.
--
-- Two crew notifications legitimately fire when the member is NOT active, so gating them
-- on 'active' would have silently killed both -- the same shape that killed 7 working
-- email flows during #387:
--
--   type                       direction         status AT NOTIFY TIME
--   -------------------------  ----------------  ---------------------
--   group_invitation           owner -> creator  'invited'
--   group_membership_removed   owner -> creator  'removed'   <- useCreatorGroupMembers.ts
--                                                               UPDATEs to 'removed' BEFORE
--                                                               dispatching the bell
--
-- Relaxing to IN ('active','invited','removed') would exclude only 'declined' and fix
-- nothing. So those two are NOT handled here: `create-notification` authorizes them
-- against the actual membership row and COMPOSES THEIR COPY SERVER-SIDE, so a forged
-- row buys an attacker nothing but a genuine-looking crew invitation in our own words --
-- which any business can already legitimately send. Same pattern as `content_liked`.
--
-- Unaffected (all fire at status='active', or are service-role):
--   group_campaign_posted (owner -> active members; the query already filters 'active'),
--   group_invite_accepted (creator -> owner, after accept), crew content_submitted.
--
-- SCOPE OF THIS FILE, STATED ACCURATELY -- and it is NOT "byte-identical to the repo".
--
-- Everything outside the crew clause is reproduced verbatim from PROD's live
-- `pg_get_functiondef('can_notify_user')`. That is deliberately NOT the same thing as the
-- repo's `20260808030000`, and the difference was found in review:
--
--   * repo `20260808030000` contains ZERO occurrences of `left_at` and ZERO of
--     `invitation_status` (checked case-insensitively; it is one of only two files in the
--     tree that define this function).
--   * prod's live body HAS both -- the conversation clause requires `left_at is null` on
--     both sides, and the org clause requires `invitation_status = 'active'` on both.
--
-- The missing link is in the ledger: `supabase_migrations.schema_migrations` records
-- **`20260808120130 can_notify_user_active_relationships`**, applied to prod during the
-- #387/#396 work, for which NO FILE EXISTS in `supabase/migrations/`. It was applied
-- directly (MCP `apply_migration`) and never written back.
--
-- So the repo could not rebuild prod: a clean `supabase db push` would have produced the
-- LOOSER function and silently dropped two authorization tightenings -- the same
-- "recorded != actual" class as [[Content Delivery State Machine]] (#325) and
-- [[Updated-At Trigger Drift]] (#385), in the opposite direction. Codifying prod's real
-- body here closes that gap as a side effect of the crew fix. `DATABASE_SCHEMA.md`
-- already documented both clauses as live, so the docs were right and the migrations
-- were behind.

create or replace function public.can_notify_user(p_actor uuid, p_recipient uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
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
      -- Crew: membership must be ACTIVE, which only the CREATOR can set (see the header).
      -- Without this, an owner-created 'invited' row -- naming anyone, unconstrained --
      -- manufactured a notification channel to any user on the platform.
      or exists (
        select 1
        from creator_groups g
        join creator_group_members m on m.group_id = g.id
        where m.status = 'active'
          and (   (g.owner_id = p_actor     and m.creator_id = p_recipient)
               or (g.owner_id = p_recipient and m.creator_id = p_actor) )
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
$function$;

-- Re-assert the lockdown. `create or replace function` PRESERVES the existing ACL, so
-- these are belt-and-braces rather than strictly required -- but a bare `revoke ... from
-- public` is NOT sufficient on Supabase (the ambient grant is recorded against PUBLIC),
-- and this function must never be callable by a client: it is the authorization oracle
-- for `create-notification`, and an anon caller could otherwise enumerate who knows whom.
revoke execute on function public.can_notify_user(uuid, uuid) from public, anon, authenticated;
grant  execute on function public.can_notify_user(uuid, uuid) to service_role;
