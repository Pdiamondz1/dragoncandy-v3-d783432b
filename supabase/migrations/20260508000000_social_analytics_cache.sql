create table social_analytics_cache (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  outstand_account_id text not null,
  platform text not null,
  metric_type text not null,
  metric_value numeric not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  fetched_at timestamptz not null default now(),
  unique(user_id, outstand_account_id, metric_type, period_start, period_end)
);

create index idx_social_analytics_cache_freshness
  on social_analytics_cache (user_id, fetched_at);

alter table social_analytics_cache enable row level security;

create policy "Users can read own analytics cache"
  on social_analytics_cache for select
  using (auth.uid() = user_id);

create policy "Users can upsert own analytics cache"
  on social_analytics_cache for insert
  with check (auth.uid() = user_id);

create policy "Users can update own analytics cache"
  on social_analytics_cache for update
  using (auth.uid() = user_id);
