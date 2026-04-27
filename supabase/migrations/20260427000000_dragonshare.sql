-- DragonShare: organic content monetization
-- Brand Boost ships first; schema supports Performance Bounty + Affiliate QR in v1.1

create table dragonshare_posts (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references profiles(user_id) on delete cascade,
  target_org_id uuid not null references organizations(id) on delete cascade,
  target_org_unit_id uuid references org_units(id) on delete set null,
  monetization_type text not null default 'brand_boost'
    check (monetization_type in ('brand_boost', 'performance_bounty', 'affiliate')),
  content_type text not null
    check (content_type in ('photo', 'video', 'reel', 'story', 'carousel')),
  platform text not null
    check (platform in ('instagram', 'tiktok', 'youtube', 'x', 'facebook', 'other')),
  post_url text not null,
  screenshot_url text,
  caption text,
  hashtags text[] default '{}',
  mentions text[] default '{}',
  status text not null default 'pending_verification'
    check (status in ('pending_verification', 'verified', 'rejected', 'expired')),
  verification_method text,
  verified_at timestamptz,
  verified_by uuid references auth.users(id),
  rejection_reason text,
  donny_recommended_tier int,
  donny_score numeric,
  donny_reach_estimate int,
  boost_status text not null default 'available'
    check (boost_status in ('available', 'boosted', 'expired', 'withdrawn')),
  submitted_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_ds_posts_org_boost on dragonshare_posts (target_org_id, boost_status, submitted_at desc);
create index idx_ds_posts_creator on dragonshare_posts (creator_id, submitted_at desc);
create index idx_ds_posts_status on dragonshare_posts (status);
alter table dragonshare_posts enable row level security;

create table dragonshare_boosts (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references dragonshare_posts(id) on delete cascade,
  boosting_org_id uuid not null references organizations(id) on delete cascade,
  boosting_user_id uuid not null references auth.users(id),
  amount_cents int not null,
  tier_label text not null check (tier_label in ('25', '50', '100', '250', 'custom')),
  platform_fee_cents int not null,
  creator_payout_cents int not null,
  stripe_payment_intent_id text,
  stripe_transfer_id text,
  status text not null default 'pending'
    check (status in ('pending', 'captured', 'transferred', 'refunded', 'failed')),
  boosted_at timestamptz not null default now(),
  captured_at timestamptz,
  transferred_at timestamptz
);

create index idx_ds_boosts_post on dragonshare_boosts (post_id);
create index idx_ds_boosts_org on dragonshare_boosts (boosting_org_id, boosted_at desc);
alter table dragonshare_boosts enable row level security;

create table dragonshare_payouts (
  id uuid primary key default gen_random_uuid(),
  boost_id uuid not null references dragonshare_boosts(id) on delete cascade,
  creator_id uuid not null references profiles(user_id) on delete cascade,
  amount_cents int not null,
  stripe_transfer_id text,
  status text not null default 'pending'
    check (status in ('pending', 'succeeded', 'failed', 'reversed')),
  failure_reason text,
  processed_at timestamptz
);

create index idx_ds_payouts_creator on dragonshare_payouts (creator_id, processed_at desc);
alter table dragonshare_payouts enable row level security;

create table dragonshare_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  actor_user_id uuid,
  actor_org_id uuid,
  post_id uuid references dragonshare_posts(id) on delete cascade,
  boost_id uuid references dragonshare_boosts(id) on delete cascade,
  payload jsonb default '{}',
  created_at timestamptz not null default now()
);

create index idx_ds_events_type on dragonshare_events (event_type, created_at desc);
create index idx_ds_events_post on dragonshare_events (post_id, created_at);
alter table dragonshare_events enable row level security;

create table dragonshare_engagement (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references dragonshare_posts(id) on delete cascade,
  measured_at timestamptz not null default now(),
  source text not null
    check (source in ('manual', 'instagram_api', 'tiktok_api', 'youtube_api', 'x_api')),
  view_count int,
  like_count int,
  comment_count int,
  share_count int,
  save_count int,
  reach int,
  impressions int
);

create index idx_ds_engagement_post on dragonshare_engagement (post_id, measured_at desc);
alter table dragonshare_engagement enable row level security;

-- RLS Policies

create policy "ds_posts_creator_select"
  on dragonshare_posts for select
  using (creator_id = auth.uid());

create policy "ds_posts_org_select"
  on dragonshare_posts for select
  using (
    status = 'verified' and
    exists (
      select 1 from org_members
      where org_members.org_id = dragonshare_posts.target_org_id
        and org_members.user_id = auth.uid()
        and org_members.invitation_status = 'active'
    )
  );

create policy "ds_posts_creator_insert"
  on dragonshare_posts for insert
  with check (creator_id = auth.uid());

create policy "ds_posts_creator_update"
  on dragonshare_posts for update
  using (creator_id = auth.uid())
  with check (creator_id = auth.uid());

create policy "ds_boosts_creator_select"
  on dragonshare_boosts for select
  using (
    exists (
      select 1 from dragonshare_posts
      where dragonshare_posts.id = dragonshare_boosts.post_id
        and dragonshare_posts.creator_id = auth.uid()
    )
  );

create policy "ds_boosts_org_select"
  on dragonshare_boosts for select
  using (
    exists (
      select 1 from org_members
      where org_members.org_id = dragonshare_boosts.boosting_org_id
        and org_members.user_id = auth.uid()
        and org_members.invitation_status = 'active'
    )
  );

create policy "ds_payouts_creator_select"
  on dragonshare_payouts for select
  using (creator_id = auth.uid());

create policy "ds_engagement_creator_select"
  on dragonshare_engagement for select
  using (
    exists (
      select 1 from dragonshare_posts
      where dragonshare_posts.id = dragonshare_engagement.post_id
        and dragonshare_posts.creator_id = auth.uid()
    )
  );

create policy "ds_engagement_org_select"
  on dragonshare_engagement for select
  using (
    exists (
      select 1 from dragonshare_boosts b
      join org_members om on om.org_id = b.boosting_org_id
      where b.post_id = dragonshare_engagement.post_id
        and om.user_id = auth.uid()
        and om.invitation_status = 'active'
    )
  );

-- Security Definer Function

create or replace function create_boost(
  p_post_id uuid,
  p_boosting_org_id uuid,
  p_amount_cents int,
  p_tier text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_boost_id uuid;
  v_post record;
  v_fee_cents int;
  v_payout_cents int;
begin
  select id, status, boost_status into v_post
  from dragonshare_posts
  where id = p_post_id
  for update;

  if v_post is null then
    raise exception 'Post not found';
  end if;
  if v_post.status <> 'verified' then
    raise exception 'Post must be verified before boosting';
  end if;
  if v_post.boost_status <> 'available' then
    raise exception 'Post is not available for boosting';
  end if;

  if not exists (
    select 1 from org_members
    where org_id = p_boosting_org_id
      and user_id = auth.uid()
      and role in ('owner', 'admin')
      and invitation_status = 'active'
  ) then
    raise exception 'Only org owners or admins can boost posts';
  end if;

  if p_tier not in ('25', '50', '100', '250', 'custom') then
    raise exception 'Invalid tier: %', p_tier;
  end if;
  if p_tier <> 'custom' and p_amount_cents <> (p_tier::int * 100) then
    raise exception 'Amount does not match tier';
  end if;
  if p_amount_cents < 500 then
    raise exception 'Minimum boost amount is $5';
  end if;

  v_fee_cents := round(p_amount_cents * 0.20);
  v_payout_cents := p_amount_cents - v_fee_cents;

  insert into dragonshare_boosts (
    post_id, boosting_org_id, boosting_user_id,
    amount_cents, tier_label, platform_fee_cents, creator_payout_cents,
    status
  ) values (
    p_post_id, p_boosting_org_id, auth.uid(),
    p_amount_cents, p_tier, v_fee_cents, v_payout_cents,
    'pending'
  )
  returning id into v_boost_id;

  return v_boost_id;
end;
$$;

-- Event Logging Triggers

create or replace function trg_ds_post_submitted_fn()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into dragonshare_events (event_type, actor_user_id, post_id, payload)
  values ('post_submitted', NEW.creator_id, NEW.id, jsonb_build_object(
    'platform', NEW.platform, 'content_type', NEW.content_type, 'target_org_id', NEW.target_org_id
  ));
  return NEW;
end;
$$;

create trigger trg_ds_post_submitted
  after insert on dragonshare_posts
  for each row execute function trg_ds_post_submitted_fn();

create or replace function trg_ds_post_verified_fn()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if OLD.status <> 'verified' and NEW.status = 'verified' then
    insert into dragonshare_events (event_type, actor_user_id, post_id, payload)
    values ('post_verified', NEW.verified_by, NEW.id, jsonb_build_object(
      'verification_method', NEW.verification_method
    ));
  end if;
  return NEW;
end;
$$;

create trigger trg_ds_post_verified
  after update on dragonshare_posts
  for each row execute function trg_ds_post_verified_fn();

create or replace function trg_ds_boost_offered_fn()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into dragonshare_events (event_type, actor_user_id, actor_org_id, post_id, boost_id, payload)
  values ('boost_offered', NEW.boosting_user_id, NEW.boosting_org_id, NEW.post_id, NEW.id, jsonb_build_object(
    'amount_cents', NEW.amount_cents, 'tier_label', NEW.tier_label
  ));
  return NEW;
end;
$$;

create trigger trg_ds_boost_offered
  after insert on dragonshare_boosts
  for each row execute function trg_ds_boost_offered_fn();

create or replace function trg_ds_boost_accepted_fn()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if OLD.status <> 'transferred' and NEW.status = 'transferred' then
    insert into dragonshare_events (event_type, actor_org_id, post_id, boost_id, payload)
    values ('boost_accepted', NEW.boosting_org_id, NEW.post_id, NEW.id, jsonb_build_object(
      'amount_cents', NEW.amount_cents, 'creator_payout_cents', NEW.creator_payout_cents
    ));
  end if;
  return NEW;
end;
$$;

create trigger trg_ds_boost_accepted
  after update on dragonshare_boosts
  for each row execute function trg_ds_boost_accepted_fn();

-- updated_at trigger
create or replace function trg_ds_posts_updated_at_fn()
returns trigger language plpgsql as $$
begin
  NEW.updated_at = now();
  return NEW;
end;
$$;

create trigger trg_ds_posts_updated_at
  before update on dragonshare_posts
  for each row execute function trg_ds_posts_updated_at_fn();
