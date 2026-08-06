-- outstand_post_ownership -- the SERVER-ESTABLISHED binding between an Outstand
-- post id and the DragonCandy user who created it.
--
-- THE HOLE THIS CLOSES (found four separate times before this migration: the
-- webhook fallback built over three tasks and deleted as a Codex P1, issue #35,
-- the verified_at gate in 20260805163247 that closed only half of #35, and the
-- 2026-08-06 reconciliation review).
--
-- Both outstand-webhook and reconcile-social-posts decide WHO OWNS a published
-- post by joining donny_scheduled_posts on metadata->>'outstand_post_id' and
-- taking the oldest row. That column is client-writable. Verified against prod
-- 2026-08-06, not assumed:
--
--   * information_schema.column_privileges: `authenticated` AND `anon` hold
--     INSERT and UPDATE on EVERY column of donny_scheduled_posts, `metadata`
--     included. No column-privilege lockdown migration exists for this table
--     (unlike social_post_log's 20260805163247).
--   * pg_policies: the INSERT policy is WITH CHECK (user_id = auth.uid()); the
--     UPDATE policy is USING (user_id = auth.uid()) with no WITH CHECK (so
--     Postgres reuses USING for the new row). Nothing anywhere constrains
--     `metadata`.
--
-- So any authenticated user may insert a schedule row carrying their own
-- user_id and ANY outstand_post_id. When a post with that id publishes, the
-- match picks the oldest row -- the planted one -- and stamps verified_at.
-- content-performance-capture then spends the org-wide OUTSTAND_API_KEY
-- fetching that post's analytics and files them under the attacker's user_id,
-- readable through social_post_log/content_performance own-row RLS. The
-- victim's own measurement is mis-filed at the same moment.
--
-- Outstand post ids are short and low-entropy -- the three real ids on prod are
-- 'XDb8e', 'XDbxe', 'mJuDd' (5 characters; the first two were created nine
-- seconds apart and share a three-character prefix) -- so an attacker does not
-- need to learn a victim's id. Planting a neighbourhood of guesses and letting
-- the hourly reconcile sweep harvest whichever ones hit is sufficient.
--
-- WHY THIS BINDING IS TRUSTWORTHY WHERE metadata IS NOT. outstand-proxy is the
-- one place in the system that holds both facts at once: it authenticates the
-- caller (ctx.userId, derived from auth.getUser() on the caller's own Supabase
-- JWT -- never read from the request body or a header) and it proxies
-- POST /posts, so it sees the created post's id in Outstand's own upstream
-- response. Neither half is client-assertable: the user id comes from a
-- verified JWT, and the post id comes from the provider. The proxy writes this
-- row with the service-role key on a 2xx create; nothing else can write it at
-- all (see the lockdown below).
--
-- Deliberately NOT resolved from business_outstand_accounts. That table's own
-- INSERT policy constrains user_id/business_id but NOT
-- outstand_social_account_id, so any authenticated user can claim any provider
-- account id -- ownership resolved through it is client-asserted, which is
-- exactly why the previous attempt was rated P1 and deleted. This table is the
-- replacement, not another indirection over the same forgeable claim.

create table if not exists public.outstand_post_ownership (
  -- The provider's post id, verbatim. text (not uuid): real Outstand ids are
  -- 5-character opaque strings, matching social_post_log.outstand_post_id and
  -- donny_scheduled_posts.metadata->>'outstand_post_id'.
  -- PRIMARY KEY: one post has exactly one creator, and the proxy's insert is
  -- ON CONFLICT DO NOTHING so a retried publish is a no-op rather than an error.
  outstand_post_id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

comment on table public.outstand_post_ownership is
  'Server-established binding: Outstand post id -> the authenticated user who created it. Written ONLY by outstand-proxy (service role) on a 2xx POST /posts, from ctx.userId (auth.getUser()) and the provider''s own response id. Read by outstand-webhook and reconcile-social-posts to decide social_post_log.user_id. NO client write path exists -- see the REVOKE below. Never resolve ownership from donny_scheduled_posts.metadata or business_outstand_accounts: both are client-writable.';

comment on column public.outstand_post_ownership.user_id is
  'The authenticated caller of POST /posts, from outstand-proxy''s auth.getUser(). For a delegated publish this is the GRANTEE (the account that made the call), which is the same user the client-side social_post_log/donny_scheduled_posts writes already record.';

-- Consumers look up by post id (the primary key) -- this index exists only for
-- the reverse direction (all posts for a user), used by ad-hoc investigation of
-- a suspected forgery, not by either consumer's hot path.
create index if not exists idx_outstand_post_ownership_user_id
  on public.outstand_post_ownership (user_id);

alter table public.outstand_post_ownership enable row level security;

-- LOCKDOWN. Read this before assuming the table is protected.
--
-- NOTE ON MECHANISM (the same lesson 20260804174854_lock_provider_columns.sql
-- learned the hard way, and 20260805163247 restated): Supabase's default
-- privileges grant `anon`, `authenticated` and `service_role` ALL privileges on
-- every table created in `public` -- at CREATE time, ambiently, with no line in
-- any migration saying so. Established empirically against prod 2026-08-06, not
-- assumed: information_schema.role_table_grants shows package_orders (created
-- 2026-08-04, no lockdown) granting anon and authenticated
-- DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE, while social_post_log
-- (same defaults, then 20260805163247's REVOKE INSERT) shows the identical set
-- MINUS INSERT for those two roles. So the CREATE TABLE above has already
-- granted anon and authenticated full write access by the time this line runs;
-- without the REVOKE, RLS would be the only thing standing between a client and
-- this table, and a table whose whole purpose is "the one ownership claim a
-- client cannot make" must not depend on a policy being present and correct.
--
-- Nothing in src/ reads or writes this table, so the client grant set is EMPTY,
-- not merely reduced -- unlike social_post_log, which had to re-grant the
-- columns its two client writers still need. If a frontend surface ever needs
-- to show a user their own bindings, add an own-row SELECT policy AND a
-- `grant select on public.outstand_post_ownership to authenticated` in a new
-- migration; a policy alone would do nothing once this REVOKE has run.
revoke all on public.outstand_post_ownership from public, anon, authenticated;
grant all on public.outstand_post_ownership to service_role;

-- service_role already bypasses RLS, so this policy is belt-and-suspenders (and
-- documents the intended writer) rather than the thing that grants access.
-- There is deliberately NO policy for anon/authenticated: with RLS enabled and
-- no policy, every client statement is denied even if a future migration
-- accidentally re-grants the table.
drop policy if exists "Service role manages outstand post ownership" on public.outstand_post_ownership;
create policy "Service role manages outstand post ownership"
  on public.outstand_post_ownership
  for all
  to service_role
  using (true)
  with check (true);

-- VERIFY AFTER APPLYING (never trust "the migration succeeded" -- an
-- ineffective lock reads as protection while providing none):
--
--   select grantee, string_agg(distinct privilege_type, ',' order by privilege_type) as privs
--   from information_schema.role_table_grants
--   where table_schema = 'public' and table_name = 'outstand_post_ownership'
--     and grantee in ('anon','authenticated','service_role','PUBLIC')
--   group by grantee;
--
-- EXPECTED: exactly one row -- service_role with the full privilege set. anon,
-- authenticated and PUBLIC must not appear at all. Any row for anon or
-- authenticated means the REVOKE did not take and this table is forgeable.
