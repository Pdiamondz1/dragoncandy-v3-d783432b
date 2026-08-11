-- donny_draft_publications — "this Donny draft has already been published."
--
-- CT-4b. Donny's social draft card is persisted verbatim into
-- donny_messages.rich_cards and re-rendered on every conversation load. The
-- card's "already sent" state lived only in React component state, so a reload
-- after a successful publish re-armed the button on the SAME draft and a second
-- tap posted a DUPLICATE to a real public feed. Publishing is irreversible and
-- public — the whole reason this card exists is that a mistake lands on a real
-- business's feed before the owner sees it.
--
-- Why a new table rather than an UPDATE policy on donny_messages: that table has
-- exactly two policies on prod (verified 2026-08-09) — SELECT own and INSERT own
-- — and no UPDATE for any surface. Adding one so the client could rewrite
-- rich_cards would hand every user write access to the stored text of what Donny
-- said, to close a UI-state problem. RLS WITH CHECK sees only the NEW row (there
-- is no OLD in a policy), so "only rich_cards may change" is not even expressible
-- as a policy — it would need column GRANTs on top. A separate append-only marker
-- keyed to the draft is smaller, is enforced by a primary key rather than by
-- policy gymnastics, and leaves donny_messages byte-unchanged.
--
-- The marker is written AFTER the publish succeeds, never before, so the
-- invariant is "row exists => the post went out" — the same ordering rule as
-- campaign_collaborations.payout_executed_at (see [[Payout Finalization &
-- Re-entrancy]]). A pre-claim would produce the worse failure: a draft marked
-- published that never posted, permanently un-postable with no way to tell.

create table if not exists public.donny_draft_publications (
  -- The card's own id, generated server-side by donny-orchestrator when the
  -- draft is built (social-draft.ts) and carried in the persisted card.
  draft_id      uuid        not null,
  user_id       uuid        not null references auth.users(id) on delete cascade,
  published_at  timestamptz not null default now(),
  -- Composite, NOT draft_id alone. A draft belongs to exactly one user, so
  -- per-user is the correct grain — and a global PK would let anyone who
  -- learned another user's draft id squat the row, making the real owner's
  -- marker insert fail after their post had already gone out.
  primary key (user_id, draft_id)
);

alter table public.donny_draft_publications enable row level security;

-- Own rows only, and only the two verbs the feature needs.
drop policy if exists "Users read own draft publications" on public.donny_draft_publications;
create policy "Users read own draft publications"
  on public.donny_draft_publications for select
  to authenticated
  using ( (select auth.uid()) = user_id );

drop policy if exists "Users record own draft publications" on public.donny_draft_publications;
create policy "Users record own draft publications"
  on public.donny_draft_publications for insert
  to authenticated
  with check ( (select auth.uid()) = user_id );

-- Deliberately NO update or delete policy: a publication is a fact about
-- something that already happened in public. Un-marking it would re-arm the
-- button on a draft that is already live, which is the defect this closes.

-- Supabase grants tables to anon/authenticated ambiently, so the policies above
-- are not the whole story — revoke first, then grant back exactly what is used.
-- Table level, not column level: a column-level revoke is a documented no-op
-- against the ambient table-wide grant (see 20260804174854, 20260805163247).
revoke all on table public.donny_draft_publications from public, anon, authenticated;
grant select, insert on table public.donny_draft_publications to authenticated;
grant all on table public.donny_draft_publications to service_role;

comment on table public.donny_draft_publications is
  'Append-only marker: a Donny social draft card (draft_id) was published by user_id at published_at. Read by SocialDraftCard to keep a published draft from re-arming after a page reload. Written by the client AFTER a successful publish.';

-- APPLIED TO PROD 2026-08-09 (version 20260809193254) and verified four ways,
-- every write rolled back. Never trust "the migration succeeded":
--
--   grants          -> authenticated: INSERT,SELECT only. No anon, no PUBLIC row.
--   cross-user INSERT -> 42501, new row violates row-level security policy
--   own INSERT        -> succeeds; own rows visible (2 of 2)
--   DELETE            -> 42501, permission denied for table (no grant exists)
--   duplicate INSERT  -> 23505 on donny_draft_publications_pkey
--
-- That last one is not incidental: useRecordDraftPublication treats 23505 as
-- success, because the primary key firing means the draft was already recorded,
-- which is the state the write was trying to reach.
--
-- Re-check the grants with:
--   select grantee, privilege_type
--   from information_schema.role_table_grants
--   where table_schema = 'public'
--     and table_name = 'donny_draft_publications'
--     and grantee in ('anon', 'authenticated', 'PUBLIC');
