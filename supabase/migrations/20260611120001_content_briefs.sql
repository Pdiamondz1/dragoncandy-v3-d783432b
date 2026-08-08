-- content_briefs — one row per Donny content-brief the creator generated for a restaurant.
-- organization_id is the id RestaurantTypeahead/search_restaurants returns (organizations.id).
-- Written only by the content-strategy-recommend edge function (service role).
create table if not exists public.content_briefs (
  id                    uuid primary key default gen_random_uuid(),
  creator_id            uuid not null references auth.users(id) on delete cascade,
  organization_id       uuid not null references public.organizations(id) on delete cascade,
  context_snapshot      jsonb not null default '{}'::jsonb,
  brief                 jsonb not null,
  model                 text,
  used_performance_data boolean not null default false,
  social_post_log_id    uuid references public.social_post_log(id) on delete set null,  -- outcome link (DEFERRED: next slice)
  created_at            timestamptz not null default now()
);

create index if not exists idx_content_briefs_creator on public.content_briefs (creator_id, created_at desc);
create index if not exists idx_content_briefs_org on public.content_briefs (organization_id);

alter table public.content_briefs enable row level security;

-- Read: the creator who requested it. No INSERT/UPDATE/DELETE policies — the edge function writes service-role.
drop policy if exists "Creators read own briefs" on public.content_briefs;
create policy "Creators read own briefs"
  on public.content_briefs for select
  to authenticated
  using ( (select auth.uid()) = creator_id );
