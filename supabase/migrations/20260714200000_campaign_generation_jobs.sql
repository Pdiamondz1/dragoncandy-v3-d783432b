-- Async campaign-generation jobs: the donny-campaign-generate edge function
-- returns a job id immediately and finishes the ~1-min generation in a
-- background task, writing the result here; the client polls its own row.
-- Survives mobile connection drops / tab backgrounding, which killed the old
-- single long fetch (see spec 2026-07-14-campaign-generate-async-jobs-design).
-- Consumer feature => FK profiles(id). Writes are service-role only.

create table public.campaign_generation_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'processing'
    check (status in ('processing', 'done', 'error')),
  progress text,
  request jsonb not null,
  result jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index campaign_generation_jobs_user_created_idx
  on public.campaign_generation_jobs (user_id, created_at desc);

alter table public.campaign_generation_jobs enable row level security;

-- Clients only ever read their own jobs; all writes come from the edge
-- function's service-role client (bypasses RLS). No anon access.
create policy "Users read own generation jobs"
  on public.campaign_generation_jobs
  for select
  to authenticated
  using (auth.uid() = user_id);
