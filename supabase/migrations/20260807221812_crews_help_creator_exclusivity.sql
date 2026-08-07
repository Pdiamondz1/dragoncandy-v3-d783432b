-- Correct the creator-facing crews help article: crew collabs are EXCLUSIVE, not EARLY.
--
-- The lead paragraph of `creator-crews-creator` claimed a crew member gets
-- "early, exclusive access" to a business's private campaigns. "exclusive" is
-- right; "early" is false. A crew campaign never becomes public:
--   * usePublicCampaigns filters `.is('group_id', null)`
--   * the campaigns SELECT policy gates the public branch on `group_id IS NULL`
--   * nothing in src/ or supabase/ ever nulls a campaign's group_id, and the FK
--     is ON DELETE RESTRICT (20260709120010) specifically to prevent it
-- So there is no marketplace debut to be early to. A creator who passed on a
-- crew collab intending to grab it off the public board later would never find it.
--
-- Also fixes "adds you to their crew" → "invites you to their crew". Membership
-- is opt-in: RLS lets an owner write only 'invited'/'removed', and activation
-- happens solely through the creator's own respond_to_group_invitation RPC
-- (20260709120018). The article's own Tips already said "You choose whether to
-- join" — the lead contradicted them.
--
-- Matches the app copy shipped in #379 (CrewsHowItWorks, GroupInviteCard, the
-- crews tab, and the crew_invitation email template).
--
-- Scoped to the one creator-facing slug: the sibling business article
-- (`creator-crews`) is already accurate — it states crew campaigns are
-- "never shown in the public marketplace". Guarded on the old phrase so
-- re-running is a no-op.

UPDATE public.help_articles
SET body = replace(
      body,
      'When a business you''ve worked with adds you to their <strong>crew</strong>, you get early, exclusive access to their private campaigns — and applying is free and instant.',
      'When a business you''ve worked with invites you to their <strong>crew</strong>, you get exclusive access to private campaigns that never go public — and applying is free and instant.'
    ),
    updated_at = now()
WHERE slug = 'creator-crews-creator'
  AND body LIKE '%early, exclusive access%';
