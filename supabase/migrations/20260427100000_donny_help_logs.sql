-- donny_help_logs: stores every Donny Help interaction for analytics + retraining
create table if not exists public.donny_help_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  page_path text not null,
  page_context jsonb default '{}',
  query text not null,
  answer text not null,
  suggested_actions jsonb default '[]',
  rating smallint check (rating in (1, -1)),
  rating_comment text,
  created_at timestamptz not null default now()
);

create index idx_donny_help_logs_page_path_created
  on public.donny_help_logs (page_path, created_at desc);

create index idx_donny_help_logs_user
  on public.donny_help_logs (user_id, created_at desc);

-- RLS
alter table public.donny_help_logs enable row level security;

create policy "Users can insert their own help logs"
  on public.donny_help_logs for insert
  with check (auth.uid() = user_id);

create policy "Users can read their own help logs"
  on public.donny_help_logs for select
  using (auth.uid() = user_id);

create policy "Users can update rating on their own logs"
  on public.donny_help_logs for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Service role bypass for edge function
create policy "Service role full access"
  on public.donny_help_logs for all
  using (auth.role() = 'service_role');
