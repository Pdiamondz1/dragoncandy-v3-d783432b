-- RENUMBERED from 20260826210000, which a PARALLEL SESSION had already recorded on
-- production as `store_tiktok_connection_stats` while this branch was open. Its FILE is
-- not in this branch, so `supabase/migrations.test.ts` — which compares versions across
-- the repo tree — structurally could not see the clash. `db:apply` caught it and refused,
-- which is the refusal working as designed: forcing past it is precisely how
-- `recorded != actual` happens, and this project has three recorded cases.
--
-- The durable point: a version is a timestamp a human picks, so the tree is only half the
-- namespace. Check the LEDGER too before choosing one.

-- Email verification by CODE, and closing the read path that keeping the session opens.
--
-- Two independent changes, in one migration because shipping either alone is wrong:
-- the second is only safe once the first exists, and the first is only safe once the
-- second does.
--
-- ============================================================================
-- 1. CLOSE THE CLIENT READ PATH  (the important half)
-- ============================================================================
-- `email_verification_tokens` carried a SELECT policy, `auth.uid() = user_id`, plus
-- ambient table-wide grants to `anon` and `authenticated`. RLS saved the writes — no
-- policy covers INSERT/UPDATE/DELETE, so they are denied — but the READ was real.
--
-- It has been INERT until now for one reason only: `AuthForm` signs the user out
-- immediately after signup, so during verification `auth.uid()` is null and the policy
-- matches nothing. The next commit stops signing users out (the app now gates on
-- `email_verified` at `ProtectedRoute` instead), which would ACTIVATE it:
--
--     sign up with an address you do not own
--       -> keep the session
--       -> select your own row through PostgREST
--       -> read the token/code
--       -> verify an email you never received
--
-- That is a dormant hole becoming a live one as a side effect of a UX change, which is
-- exactly the shape of defect this project keeps recording. Closed here rather than
-- discovered later.
--
-- Nothing reads this table from the client: `grep -rn email_verification_tokens src/`
-- returns only the generated `types.ts`. Both real consumers — `send-verification-email`
-- and `verify-email` — use the service role, which is exempt from RLS and from these
-- grants. So removing client access costs nothing.
--
-- The REVOKE is table-level, deliberately. A column-level revoke is a documented no-op
-- against Supabase's ambient table-wide grant; this project has four recorded instances
-- of that mistake (`20260507130028`, `20260523234847` among them).
drop policy if exists "Users can view own verification tokens" on public.email_verification_tokens;

revoke all on public.email_verification_tokens from anon, authenticated;

-- Belt and braces, and they fail differently: grants are the ambient permission, RLS is
-- the row rule. A future migration that re-grants the table still meets RLS with no
-- policy for any command, and is denied.

-- ============================================================================
-- 2. THE CODE FLOW  (additive, nullable, no backfill)
-- ============================================================================
-- `token` stays exactly as it is: a `crypto.randomUUID()` behind the emailed LINK, which
-- keeps working for the read-mail-on-your-phone case.
--
-- `code` is the six digits the user types into the tab they signed up on. It is a
-- SEPARATE column rather than a re-use of `token` because the two have different threat
-- models: a UUID in a URL is unguessable and needs no attempt limit, while a six-digit
-- code is a 1,000,000-space secret and is worthless without one.
--
-- `attempts` is that limit. Counting failed checks on the row itself keeps the whole
-- flow in one place — no second table, unlike `phone_verification_attempts`, which needs
-- one because it also throttles by IP for a metered vendor. Here the cost of a wrong
-- guess is not a carrier bill; it is a brute-force window, and the row is the natural
-- place to bound it.
--
-- Both columns are NULLABLE with NO DEFAULT and no backfill. The table holds zero rows
-- today (checked on production 2026-08-26), so there is nothing to migrate; nullable is
-- still correct because a default would rewrite every future row's shape for no reason,
-- and NULL means "this row predates the code flow" rather than "zero attempts".
alter table public.email_verification_tokens
  add column if not exists code text,
  add column if not exists attempts integer;

-- Lookup is by (user_id, code) on the check path. Partial on unconsumed rows: a verified
-- or expired row is never a candidate, and the index should not carry them.
create index if not exists idx_evt_user_code_live
  on public.email_verification_tokens (user_id, code)
  where verified_at is null;

comment on column public.email_verification_tokens.code is
  'Six-digit code typed into the signup tab. Guessable by construction, so it is only ever safe alongside `attempts` and `expires_at`. Never exposed to a client: see the REVOKE above.';
comment on column public.email_verification_tokens.attempts is
  'Failed check count for `code`. NULL means the row predates the code flow.';
