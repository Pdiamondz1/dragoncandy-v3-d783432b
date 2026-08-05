-- Rows a signed Outstand post.published event confirmed. The client INSERT policy
-- on social_post_log constrains only user_id, so outstand_post_id is caller-supplied
-- and unverified; the webhook's HMAC signature is the one authority in this chain
-- that a client cannot forge. content-performance-capture measures only stamped rows,
-- so a fabricated post id never costs an API call against the shared org-wide key.
--
-- NOT sufficient on its own: an attacker who already knows a real post id can still
-- plant rows, because donny_scheduled_posts is equally forgeable. See
-- docs/wiki/raw/sessions/2026-08-05-outstand-cross-tenant-metric-read.md.
alter table public.social_post_log
  add column if not exists verified_at timestamptz;

comment on column public.social_post_log.verified_at is
  'Set only by outstand-webhook (service role) when a signed post.published confirmed this post. NULL = client-asserted, not measured.';

create index if not exists idx_spl_verified_at
  on public.social_post_log (verified_at)
  where verified_at is not null;
