-- Lock a creator's UPDATE on campaign_invitations down to "decline my own pending invite".
--
-- The old policy was:
--   FOR UPDATE USING (auth.uid() = creator_id)   -- and NO WITH CHECK
--
-- Postgres defaults an omitted WITH CHECK to the USING expression, so `creator_id`
-- was in fact pinned (a creator could not reassign the row to someone else — verified).
-- But nothing constrained the OTHER columns. Proved on prod 2026-08-08 by impersonating
-- a real invitee inside a rolled-back transaction:
--
--   forge status='accepted'  -> ALLOWED
--   move to another campaign -> ALLOWED
--   reassign creator_id      -> blocked
--
-- Both live holes matter:
--
-- 1. status forgery. `apply_to_campaign` is what legitimately flips an invitation to
--    'accepted', as a side effect of actually applying. A creator writing 'accepted'
--    directly makes the business's campaign detail page show "Applied — review them"
--    (added in #382) when no application exists — the UI states something false.
--
-- 2. campaign_id rewrite — the worse one. `useCreateApplication` (and the matching
--    campaign_applications INSERT policy) let an *invited* creator apply to a campaign
--    that is no longer `published`. So repointing any pending invitation at an arbitrary
--    campaign id manufactures apply rights on a closed campaign.
--
-- Why a policy alone cannot fix #2: RLS WITH CHECK sees only the NEW row — there is no
-- OLD in a policy expression — so "campaign_id must not change" is inexpressible here.
-- Column-level privileges are the right tool, so this does both:
--   * the policy narrows WHICH rows and WHAT status a creator may write, and
--   * the grant narrows WHICH COLUMNS they may write at all.
--
-- Nothing legitimate is lost. The only client-side UPDATE of this table in the whole
-- app is `useDeclineInvitation` writing { status: 'declined' } (src/hooks/useCampaignInvitations.ts).
-- Accepting runs through `apply_to_campaign`, which is SECURITY DEFINER owned by postgres,
-- so it bypasses both RLS and these column grants. Edge functions use the service role.

drop policy if exists "Creators can update invitations sent to them" on public.campaign_invitations;

create policy "Creators can decline their own pending invitations"
  on public.campaign_invitations
  for update
  to authenticated
  using (auth.uid() = creator_id and status = 'pending')
  with check (auth.uid() = creator_id and status = 'declined');

-- Column-level lockdown. REVOKE at TABLE level first: a column-level REVOKE is a
-- documented no-op against an existing table-wide GRANT (the lesson recorded by
-- migrations 20260804174854 and 20260805163247).
revoke update on public.campaign_invitations from authenticated, anon;

-- `anon` gets nothing back — it has no UPDATE policy, so its grant was always inert.
grant update (status) on public.campaign_invitations to authenticated;

-- Verify. Expect exactly one row: authenticated / status.
-- Any row naming another column, or an `anon` row, means the REVOKE did not take.
--
-- PUBLIC is included in the filter deliberately: a table-wide `GRANT UPDATE ... TO PUBLIC`
-- is recorded under grantee 'PUBLIC', not under the role that inherits it, so checking only
-- anon/authenticated would let such a grant leave every column writable while this
-- assertion still passed — a verification that cannot fail is not a verification.
do $$
declare
  v_cols text;
begin
  select string_agg(grantee || ':' || column_name, ', ' order by grantee, column_name)
    into v_cols
  from information_schema.column_privileges
  where table_schema = 'public'
    and table_name   = 'campaign_invitations'
    and privilege_type = 'UPDATE'
    and grantee in ('anon', 'authenticated', 'PUBLIC');

  raise notice 'campaign_invitations UPDATE column grants (anon/authenticated/PUBLIC): %',
    coalesce(v_cols, '<none>');

  if v_cols is distinct from 'authenticated:status' then
    raise exception
      'Unexpected UPDATE column grants on campaign_invitations: % (expected exactly authenticated:status)',
      coalesce(v_cols, '<none>');
  end if;
end $$;
