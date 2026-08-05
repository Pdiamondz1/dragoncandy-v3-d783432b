-- Rows a signed Outstand post.published event confirmed. The client INSERT policy
-- on social_post_log constrains only user_id, so outstand_post_id is caller-supplied
-- and unverified; the webhook's HMAC signature is the one authority in this chain
-- that a client cannot forge. content-performance-capture measures only stamped rows,
-- so a fabricated post id never costs an API call against the shared org-wide key --
-- BUT ONLY WITH the column-privilege lockdown below. Adding `verified_at` alone
-- changes nothing: Supabase's ambient GRANT INSERT ON social_post_log TO
-- authenticated is table-wide, ambient, and pre-dates this migration, so with no
-- column-level restriction a client can already insert `verified_at` itself in the
-- same statement that fabricates `outstand_post_id` -- self-stamping past the gate
-- with zero signature involved. The REVOKE/GRANT pair makes the webhook's stamp the
-- only one that can land; without it this migration is decorative.
--
-- NOT sufficient on its own even with the lockdown: an attacker who already knows a
-- real post id can still plant rows, because donny_scheduled_posts is equally
-- forgeable. See docs/wiki/raw/sessions/2026-08-05-outstand-cross-tenant-metric-read.md.
alter table public.social_post_log
  add column if not exists verified_at timestamptz;

comment on column public.social_post_log.verified_at is
  'Set only by outstand-webhook (service role) when a signed post.published confirmed this post. NULL = client-asserted, not measured. Enforced by column-privilege lockdown below -- see that comment before assuming this column is trustworthy.';

create index if not exists idx_spl_verified_at
  on public.social_post_log (verified_at)
  where verified_at is not null;

-- Lock verified_at against client writes.
--
-- NOTE ON MECHANISM (same lesson as 20260804174854_lock_provider_columns.sql,
-- which is a recorded no-op for exactly this reason): a bare
-- `REVOKE INSERT (verified_at) ON social_post_log FROM authenticated` does
-- NOTHING here. Supabase grants `authenticated` table-wide INSERT on every
-- table by default, and a column-level revoke cannot subtract from a
-- table-level grant -- the table-wide grant still covers verified_at
-- regardless of what the column-level revoke says. The only way to restrict
-- to a column subset is to drop the table-wide grant entirely and re-grant
-- the exact client-writable columns, which is what
-- 20260804174934_lock_provider_columns_v2.sql did for
-- business_outstand_accounts and what this does here. Verify with
-- information_schema.column_privileges after applying, never "the migration
-- succeeded" -- an ineffective lock reads as protection while providing none.
--
-- The re-granted set is the COMPLETE client INSERT surface for this table
-- today, `verified_at` deliberately excluded:
--   id                  -> has a default, but generous rather than minimal:
--                          20260805090000_backfill_social_post_log.sql
--                          deliberately set an explicit id on its inserted rows
--   user_id              -> both client paths below (RLS anchor)
--   campaign_id          -> both client paths below
--   outstand_post_id     -> both client paths below
--   platform             -> both client paths below
--   post_type            -> both client paths below
--   dragonshare_post_id  -> src/contexts/DonnyProvider.tsx (publishDraft)
--   created_at           -> has a default, but generous rather than minimal:
--                          20260805090000_backfill_social_post_log.sql
--                          deliberately backdates created_at to the post's
--                          original published_at (load-bearing for the capture
--                          job's 8-day window), and a missing grant here would
--                          silently break any future rerun in a way no test
--                          would catch
-- Client paths: src/contexts/DonnyProvider.tsx (publishDraft) and
-- src/hooks/outstand/useSponsorshipAmplification.ts. Neither sets
-- source_brief_id (trigger-derived), hashtags/caption/scheduled_at/
-- published_at/format/creator_id (webhook/service-role only), or verified_at.
-- Every service-role write path (outstand-webhook, and the backfill migration,
-- which runs as the migration role) bypasses column grants entirely, so this
-- has no effect on them. `anon` is granted nothing: there is no anon INSERT
-- policy, so RLS already blocks it and any grant would be meaningless.
revoke insert on public.social_post_log from anon, authenticated;

grant insert (
  id, user_id, campaign_id, outstand_post_id, platform, post_type,
  dragonshare_post_id, created_at
) on public.social_post_log to authenticated;
