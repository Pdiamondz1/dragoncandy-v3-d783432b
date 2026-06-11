-- content_performance — append-only per-post performance snapshots captured as
-- engagement matures (T+24h / T+72h / T+7d). Driven by social_post_log; written
-- only by the service-role capture loop (users cannot forge performance numbers).
create table if not exists public.content_performance (
  id                  uuid primary key default gen_random_uuid(),
  social_post_log_id  uuid references public.social_post_log(id) on delete cascade,
  user_id             uuid not null references auth.users(id) on delete cascade,
  campaign_id         uuid references public.campaigns(id),
  outstand_post_id    text not null,
  platform            text not null,
  post_type           text not null,
  views               numeric,
  likes               numeric,
  comments            numeric,
  shares              numeric,
  saves               numeric,
  reach               numeric,
  engagement_rate     numeric,
  raw                 jsonb not null default '{}'::jsonb,
  milestone           text not null check (milestone in ('24h','72h','7d')),
  is_settled          boolean not null default false,
  captured_at         timestamptz not null default now()
);

-- Append-only grain: at most one snapshot per post per milestone (idempotent re-runs).
create unique index if not exists uniq_content_perf_post_milestone
  on public.content_performance (outstand_post_id, milestone);

create index if not exists idx_content_perf_user
  on public.content_performance (user_id, captured_at);
create index if not exists idx_content_perf_campaign
  on public.content_performance (campaign_id);
create index if not exists idx_content_perf_post
  on public.content_performance (outstand_post_id);

alter table public.content_performance enable row level security;

-- Read: owner only (TO authenticated + ownership predicate — not role-only, which would be IDOR).
drop policy if exists "Users read own content performance" on public.content_performance;
create policy "Users read own content performance"
  on public.content_performance for select
  to authenticated
  using ( (select auth.uid()) = user_id );

-- No INSERT/UPDATE/DELETE policies: the only writer is the service-role capture
-- loop (bypasses RLS). This keeps the metric trustworthy.
