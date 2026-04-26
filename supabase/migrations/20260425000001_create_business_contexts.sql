-- Create business_contexts table for caching extracted business data
create table if not exists business_contexts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete cascade,
  source_url text not null,
  source_type text not null check (source_type in ('google_business', 'instagram', 'website', 'yelp', 'photo', 'manual')),
  extracted_data jsonb not null,
  extracted_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days')
);

create index idx_business_contexts_profile on business_contexts(profile_id);
create index idx_business_contexts_expires on business_contexts(expires_at);

alter table business_contexts enable row level security;

create policy "Users can read own business contexts"
  on business_contexts for select
  using (auth.uid() = profile_id);

create policy "Users can insert own business contexts"
  on business_contexts for insert
  with check (auth.uid() = profile_id);

create policy "Users can delete own business contexts"
  on business_contexts for delete
  using (auth.uid() = profile_id);
