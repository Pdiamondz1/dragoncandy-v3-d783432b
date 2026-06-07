-- outstand_webhook_events — idempotency + audit log for inbound Outstand webhooks.
-- Service-role only (Edge Function writes); RLS on with no policies.
create table if not exists public.outstand_webhook_events (
  id          text primary key,          -- "<event>:<postId>"
  event       text not null,
  post_id     text,
  account_id  text,
  payload     jsonb default '{}'::jsonb,
  received_at timestamptz not null default now()
);

alter table public.outstand_webhook_events enable row level security;
-- No policies: only the service_role (which bypasses RLS) reads/writes.

-- Correlation lookup used by the webhook handler
-- (donny_scheduled_posts.metadata->>'outstand_post_id' = payload postId).
create index if not exists idx_dsp_outstand_post_id
  on public.donny_scheduled_posts ((metadata->>'outstand_post_id'));
