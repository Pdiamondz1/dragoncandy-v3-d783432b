-- Tour + coachmark state on profiles
alter table public.profiles
  add column if not exists onboarding_completed_at timestamptz,
  add column if not exists dismissed_coachmarks jsonb default '[]'::jsonb;

-- WhyExpander analytics
create table if not exists public.why_expander_views (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  expander_key text not null,
  viewed_at timestamptz not null default now()
);

create index idx_why_expander_views_key
  on public.why_expander_views (expander_key, viewed_at desc);

alter table public.why_expander_views enable row level security;

create policy "Users can insert their own expander views"
  on public.why_expander_views for insert
  with check (auth.uid() = user_id);

create policy "Users can read their own expander views"
  on public.why_expander_views for select
  using (auth.uid() = user_id);

create policy "Service role full access on why_expander_views"
  on public.why_expander_views for all
  using (auth.role() = 'service_role');
