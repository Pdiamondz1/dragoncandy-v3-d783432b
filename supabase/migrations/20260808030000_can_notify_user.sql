-- can_notify_user(actor, recipient): is there a real relationship that makes it
-- legitimate for `actor` to put a notification in `recipient`'s feed?
--
-- Backing `create-notification`, which authenticated its caller and then discarded the
-- user object — every field, including `recipientId`, came from the request body and was
-- written with the service role. Any authenticated user could notify anyone.
--
-- The clause set is not guessed. It was derived two ways and they were cross-checked:
--
--  * Backtested against all 91 actor-bearing rows in `push_notifications` (18 types,
--    May–Aug 2026): campaign ∪ conversation ∪ crew ∪ org covers 89/91. The 2 misses are
--    `content_liked`, which is handled in the edge function by verifying the referenced
--    post rather than a relationship (a liker legitimately has no prior tie to the poster).
--
--  * Enumerated across all 32 client call sites, which caught what the backtest could not,
--    because those types have never fired in prod:
--      - SPONSORSHIP (brand ↔ restaurant via campaign_sponsorships) — added below.
--      - COLD CONTACT from a public profile (ContactCreatorModal / ContactRestaurantModal).
--        Looks like it needs an exemption — it does NOT. Both modals `await`
--        `createConversation` before sending, so `create_or_get_direct_conversation` has
--        already inserted both `conversation_participants` rows by the time the
--        `message_received` notify fires, and the conversation clause below covers it.
--        There is deliberately NO "open type" branch in the edge function.
--
--        This rests on an ORDERING dependency: conversation created, then notify. If that
--        sequencing is ever inverted, cold contact will start silently 403ing — and this
--        clause set is where to look.

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
      -- Same person: always fine (self-notifications, e.g. receipts).
      p_actor = p_recipient

      -- Campaign: one side owns a campaign the other applied to, collaborates on,
      -- or was invited to (either direction).
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

      -- Conversation: they share a message thread.
      or exists (
        select 1
        from conversation_participants p1
        join conversation_participants p2 on p2.conversation_id = p1.conversation_id
        where p1.user_id = p_actor and p2.user_id = p_recipient
      )

      -- Crew: one owns a creator group the other belongs to (either direction).
      or exists (
        select 1
        from creator_groups g
        join creator_group_members m on m.group_id = g.id
        where (g.owner_id = p_actor and m.creator_id = p_recipient)
           or (g.owner_id = p_recipient and m.creator_id = p_actor)
      )

      -- Organization: they are members of the same org.
      or exists (
        select 1
        from org_members o1
        join org_members o2 on o2.org_id = o1.org_id
        where o1.user_id = p_actor and o2.user_id = p_recipient
      )

      -- Sponsorship: brand ↔ restaurant on a sponsored campaign. Found by call-site
      -- enumeration, NOT by the backtest — no sponsorship notification has ever fired on
      -- prod, so historical data could not have revealed it.
      --
      -- NOTE the indirection: `brand_id` and `restaurant_id` are FKs to
      -- `business_profiles.id`, NOT to `auth.users`. They must be resolved through
      -- `business_profiles.user_id`, which is what the call sites notify
      -- (`brandProfile.user_id` / `restaurantProfile.user_id`). Comparing the raw columns
      -- to a user id would simply never match, and would fail silently.
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
