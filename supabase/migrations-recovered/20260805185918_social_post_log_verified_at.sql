-- Recovered 2026-08-24 from production's migration ledger, which was the only
-- place this migration existed. Version 20260805185918 IS recorded on production.
-- This is a record of what ran, not a migration: see README.md in this directory.
-- Everything below the blank line is the ledger's SQL, verbatim.

alter table public.social_post_log
  add column if not exists verified_at timestamptz;

comment on column public.social_post_log.verified_at is
  'Set only by outstand-webhook (service role) when a signed post.published confirmed this post. NULL = client-asserted, not measured. Enforced by column-privilege lockdown -- a bare column-level REVOKE would be a no-op against the ambient table-wide grant.';

create index if not exists idx_spl_verified_at
  on public.social_post_log (verified_at)
  where verified_at is not null;

revoke insert on public.social_post_log from anon, authenticated;

grant insert (
  id, user_id, campaign_id, outstand_post_id, platform, post_type,
  dragonshare_post_id, created_at
) on public.social_post_log to authenticated;
