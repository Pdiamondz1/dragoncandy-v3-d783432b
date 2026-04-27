# DragonShare Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build DragonShare — organic content monetization where creators submit posts mentioning brands, brands boost (pay for) those posts, and DragonCandy takes 20%.

**Architecture:** Four sequential phases: schema migration (P3.1), creator submit flow (P3.2), brand inbox (P3.3), boost payment (P3.4). Each phase produces a working, testable increment. The schema is designed to support Brand Boost (shipping now), Performance Bounty, and Affiliate QR (v1.1) without migration.

**Tech Stack:** Supabase (Postgres, Edge Functions, RLS), Stripe Connect (PaymentIntent + Transfer), React + TypeScript, TanStack Query, Tailwind CSS, shadcn/ui.

**PROTECT rules — do NOT modify:**
- `payment_events` table
- `_shared/platform-fee.ts`
- Stripe webhook signature verification pattern
- Creator profile schema (Stripe Connect ID stays on `creator_profiles`)
- Portfolio upload flow
- Existing `lg:` responsive classes

---

## File Map

### New Files

| File | Responsibility |
|---|---|
| `supabase/migrations/20260427000000_dragonshare.sql` | 5 tables, RLS, security definer, triggers |
| `supabase/functions/donny-dragonshare-score/index.ts` | AI scoring edge function |
| `supabase/functions/boost-payment/index.ts` | Stripe payment + transfer edge function |
| `supabase/functions/_shared/dragonshare-fee.ts` | 20% fee calculation |
| `src/hooks/useDragonShare.ts` | React Query hooks for all DragonShare data |
| `src/pages/CreatorDragonShare.tsx` | Creator inbox (submitted/boosted/expired tabs) |
| `src/pages/BusinessDragonShare.tsx` | Brand/restaurant inbox with boost cards |
| `src/pages/AdminDragonShareQueue.tsx` | Admin verification queue |
| `src/pages/AdminDragonShareLedger.tsx` | Admin reconciliation report |
| `src/components/dragonshare/DragonShareSubmitSheet.tsx` | 4-step submit flow |
| `src/components/dragonshare/DragonSharePostCard.tsx` | Post card for brand inbox |
| `src/components/dragonshare/BoostConfirmationSheet.tsx` | Boost tier confirmation |
| `src/components/dragonshare/DragonShareStatTile.tsx` | Dashboard stat tile |
| `src/types/dragonshare.ts` | TypeScript types |

### Modified Files

| File | Change |
|---|---|
| `src/lib/navConfig.ts` | Add DragonShare to sidebar + drawer for all 3 roles |
| `src/App.tsx` | Add 6 new routes (creator, business, brand, 2 admin) |
| `supabase/functions/stripe-webhook/index.ts` | Add boost payment event handlers |
| `src/pages/CreatorDashboard.tsx` | Add DragonShare earnings stat tile |
| `src/pages/BusinessDashboard.tsx` | Add DragonShare boosts stat tile |
| `src/pages/BrandDashboard.tsx` | Add DragonShare boosts stat tile |

---

## Task 1: DragonShare TypeScript Types

**Files:**
- Create: `src/types/dragonshare.ts`

- [ ] **Step 1: Create type definitions**

```typescript
// src/types/dragonshare.ts

export type MonetizationType = 'brand_boost' | 'performance_bounty' | 'affiliate';
export type ContentType = 'photo' | 'video' | 'reel' | 'story' | 'carousel';
export type PostPlatform = 'instagram' | 'tiktok' | 'youtube' | 'x' | 'facebook' | 'other';
export type PostStatus = 'pending_verification' | 'verified' | 'rejected' | 'expired';
export type BoostStatus = 'available' | 'boosted' | 'expired' | 'withdrawn';
export type BoostPaymentStatus = 'pending' | 'captured' | 'transferred' | 'refunded' | 'failed';
export type PayoutStatus = 'pending' | 'succeeded' | 'failed' | 'reversed';
export type BoostTierLabel = '25' | '50' | '100' | '250' | 'custom';

export const BOOST_TIERS = [
  { label: '25' as const, cents: 2500, display: '$25' },
  { label: '50' as const, cents: 5000, display: '$50' },
  { label: '100' as const, cents: 10000, display: '$100' },
  { label: '250' as const, cents: 25000, display: '$250' },
] as const;

export const DRAGONSHARE_FEE_RATE = 0.20;

export interface DragonSharePost {
  id: string;
  creator_id: string;
  target_org_id: string;
  target_org_unit_id: string | null;
  monetization_type: MonetizationType;
  content_type: ContentType;
  platform: PostPlatform;
  post_url: string;
  screenshot_url: string | null;
  caption: string | null;
  hashtags: string[];
  mentions: string[];
  status: PostStatus;
  verification_method: string | null;
  verified_at: string | null;
  verified_by: string | null;
  rejection_reason: string | null;
  donny_recommended_tier: number | null;
  donny_score: number | null;
  donny_reach_estimate: number | null;
  boost_status: BoostStatus;
  submitted_at: string;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

export interface DragonSharePostWithRelations extends DragonSharePost {
  creator?: { id: string; full_name: string; avatar_url: string | null };
  target_org?: { id: string; name: string; logo_url: string | null };
  boosts?: DragonShareBoost[];
}

export interface DragonShareBoost {
  id: string;
  post_id: string;
  boosting_org_id: string;
  boosting_user_id: string;
  amount_cents: number;
  tier_label: BoostTierLabel;
  platform_fee_cents: number;
  creator_payout_cents: number;
  stripe_payment_intent_id: string | null;
  stripe_transfer_id: string | null;
  status: BoostPaymentStatus;
  boosted_at: string;
  captured_at: string | null;
  transferred_at: string | null;
}

export interface DragonSharePayout {
  id: string;
  boost_id: string;
  creator_id: string;
  amount_cents: number;
  stripe_transfer_id: string | null;
  status: PayoutStatus;
  failure_reason: string | null;
  processed_at: string | null;
}

export interface DonnyScoreResult {
  estimated_reach: number;
  recommended_tier: 25 | 50 | 100 | 250;
  match_quality: number;
  rationale: string;
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build 2>&1 | head -5`
Expected: No errors related to dragonshare types

- [ ] **Step 3: Commit**

```bash
git add src/types/dragonshare.ts
git commit -m "feat(dragonshare): TypeScript type definitions"
```

---

## Task 2: DragonShare Schema Migration (P3.1)

**Files:**
- Create: `supabase/migrations/20260427000000_dragonshare.sql`

- [ ] **Step 1: Write the migration — tables**

```sql
-- DragonShare: organic content monetization
-- Brand Boost ships first; schema supports Performance Bounty + Affiliate QR in v1.1

-- ═══ TABLE: dragonshare_posts ═══════════════════════════════════════════════

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

-- ═══ TABLE: dragonshare_boosts ══════════════════════════════════════════════

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

-- ═══ TABLE: dragonshare_payouts ═════════════════════════════════════════════

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

-- ═══ TABLE: dragonshare_events ══════════════════════════════════════════════

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

-- ═══ TABLE: dragonshare_engagement (v1.1 social API — schema only) ══════════

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
```

- [ ] **Step 2: Write the migration — RLS policies**

Append to the same migration file:

```sql
-- ═══ RLS POLICIES ═══════════════════════════════════════════════════════════

-- dragonshare_posts: creator reads own
create policy "ds_posts_creator_select"
  on dragonshare_posts for select
  using (creator_id = auth.uid());

-- dragonshare_posts: org members read posts targeting their org
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

-- dragonshare_posts: creator inserts own
create policy "ds_posts_creator_insert"
  on dragonshare_posts for insert
  with check (creator_id = auth.uid());

-- dragonshare_posts: creator updates limited fields
create policy "ds_posts_creator_update"
  on dragonshare_posts for update
  using (creator_id = auth.uid())
  with check (creator_id = auth.uid());

-- dragonshare_boosts: creator reads boosts on own posts
create policy "ds_boosts_creator_select"
  on dragonshare_boosts for select
  using (
    exists (
      select 1 from dragonshare_posts
      where dragonshare_posts.id = dragonshare_boosts.post_id
        and dragonshare_posts.creator_id = auth.uid()
    )
  );

-- dragonshare_boosts: boosting org members read their boosts
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

-- dragonshare_payouts: creator reads own
create policy "ds_payouts_creator_select"
  on dragonshare_payouts for select
  using (creator_id = auth.uid());

-- dragonshare_engagement: creator reads own post engagement
create policy "ds_engagement_creator_select"
  on dragonshare_engagement for select
  using (
    exists (
      select 1 from dragonshare_posts
      where dragonshare_posts.id = dragonshare_engagement.post_id
        and dragonshare_posts.creator_id = auth.uid()
    )
  );

-- dragonshare_engagement: boosting orgs read
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
```

- [ ] **Step 3: Write the migration — security definer function**

Append to the same migration file:

```sql
-- ═══ SECURITY DEFINER: create_boost ═════════════════════════════════════════

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
  -- Validate post exists, is verified, and not already boosted
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

  -- Validate caller is owner or admin of boosting org
  if not exists (
    select 1 from org_members
    where org_id = p_boosting_org_id
      and user_id = auth.uid()
      and role in ('owner', 'admin')
      and invitation_status = 'active'
  ) then
    raise exception 'Only org owners or admins can boost posts';
  end if;

  -- Validate tier
  if p_tier not in ('25', '50', '100', '250', 'custom') then
    raise exception 'Invalid tier: %', p_tier;
  end if;
  if p_tier <> 'custom' and p_amount_cents <> (p_tier::int * 100) then
    raise exception 'Amount does not match tier';
  end if;
  if p_amount_cents < 500 then
    raise exception 'Minimum boost amount is $5';
  end if;

  -- Calculate split: 20% platform, 80% creator
  v_fee_cents := round(p_amount_cents * 0.20);
  v_payout_cents := p_amount_cents - v_fee_cents;

  -- Create boost row
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
```

- [ ] **Step 4: Write the migration — event logging triggers**

Append to the same migration file:

```sql
-- ═══ EVENT LOGGING TRIGGERS ═════════════════════════════════════════════════

create or replace function trg_ds_post_submitted_fn()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into dragonshare_events (event_type, actor_user_id, post_id, payload)
  values ('post_submitted', NEW.creator_id, NEW.id, jsonb_build_object(
    'platform', NEW.platform,
    'content_type', NEW.content_type,
    'target_org_id', NEW.target_org_id
  ));
  return NEW;
end;
$$;

create trigger trg_ds_post_submitted
  after insert on dragonshare_posts
  for each row
  execute function trg_ds_post_submitted_fn();

create or replace function trg_ds_post_verified_fn()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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
  for each row
  execute function trg_ds_post_verified_fn();

create or replace function trg_ds_boost_offered_fn()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into dragonshare_events (event_type, actor_user_id, actor_org_id, post_id, boost_id, payload)
  values ('boost_offered', NEW.boosting_user_id, NEW.boosting_org_id, NEW.post_id, NEW.id, jsonb_build_object(
    'amount_cents', NEW.amount_cents,
    'tier_label', NEW.tier_label
  ));
  return NEW;
end;
$$;

create trigger trg_ds_boost_offered
  after insert on dragonshare_boosts
  for each row
  execute function trg_ds_boost_offered_fn();

create or replace function trg_ds_boost_accepted_fn()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if OLD.status <> 'transferred' and NEW.status = 'transferred' then
    insert into dragonshare_events (event_type, actor_org_id, post_id, boost_id, payload)
    values ('boost_accepted', NEW.boosting_org_id, NEW.post_id, NEW.id, jsonb_build_object(
      'amount_cents', NEW.amount_cents,
      'creator_payout_cents', NEW.creator_payout_cents
    ));
  end if;
  return NEW;
end;
$$;

create trigger trg_ds_boost_accepted
  after update on dragonshare_boosts
  for each row
  execute function trg_ds_boost_accepted_fn();

-- ═══ UPDATED_AT TRIGGER ════════════════════════════════════════════════════

create or replace function trg_ds_posts_updated_at_fn()
returns trigger
language plpgsql
as $$
begin
  NEW.updated_at = now();
  return NEW;
end;
$$;

create trigger trg_ds_posts_updated_at
  before update on dragonshare_posts
  for each row
  execute function trg_ds_posts_updated_at_fn();
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260427000000_dragonshare.sql
git commit -m "schema(dragonshare): posts, boosts, payouts, events, engagement, RLS, triggers"
```

---

## Task 3: DragonShare Fee Helper

**Files:**
- Create: `supabase/functions/_shared/dragonshare-fee.ts`

- [ ] **Step 1: Create the fee calculation module**

```typescript
// supabase/functions/_shared/dragonshare-fee.ts

export const DRAGONSHARE_FEE_RATE = 0.20;

export function calculateDragonShareFee(amountCents: number): {
  platformFeeCents: number;
  creatorPayoutCents: number;
} {
  const platformFeeCents = Math.round(amountCents * DRAGONSHARE_FEE_RATE);
  const creatorPayoutCents = amountCents - platformFeeCents;
  return { platformFeeCents, creatorPayoutCents };
}
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/_shared/dragonshare-fee.ts
git commit -m "feat(dragonshare): 20% fee calculation helper"
```

---

## Task 4: React Query Hooks for DragonShare

**Files:**
- Create: `src/hooks/useDragonShare.ts`

- [ ] **Step 1: Create the hooks module**

```typescript
// src/hooks/useDragonShare.ts

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type {
  DragonSharePost,
  DragonSharePostWithRelations,
  DragonShareBoost,
  DragonSharePayout,
  PostStatus,
  BoostStatus,
} from '@/types/dragonshare';

const KEYS = {
  creatorPosts: (userId?: string) => ['dragonshare-posts', 'creator', userId],
  orgPosts: (orgId?: string) => ['dragonshare-posts', 'org', orgId],
  post: (postId?: string) => ['dragonshare-post', postId],
  creatorPayouts: (userId?: string) => ['dragonshare-payouts', userId],
  adminQueue: () => ['dragonshare-admin-queue'],
  creatorMonthlyCount: (userId?: string) => ['dragonshare-monthly-count', userId],
  orgBoostStats: (orgId?: string) => ['dragonshare-boost-stats', orgId],
  creatorEarningsStats: (userId?: string) => ['dragonshare-earnings-stats', userId],
};

// ── Creator: fetch own posts ────────────────────────────────────────────────

export function useCreatorDragonSharePosts() {
  const { user } = useAuth();
  return useQuery({
    queryKey: KEYS.creatorPosts(user?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('dragonshare_posts')
        .select('*, boosts:dragonshare_boosts(*), target_org:organizations(id, name, logo_url)')
        .eq('creator_id', user!.id)
        .order('submitted_at', { ascending: false });
      if (error) throw error;
      return data as DragonSharePostWithRelations[];
    },
    enabled: !!user,
  });
}

// ── Org: fetch posts targeting this org (verified only, via RLS) ────────────

export function useOrgDragonSharePosts(orgId?: string | null) {
  return useQuery({
    queryKey: KEYS.orgPosts(orgId ?? undefined),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('dragonshare_posts')
        .select(`
          *,
          creator:profiles!dragonshare_posts_creator_id_fkey(id, full_name, avatar_url),
          boosts:dragonshare_boosts(*)
        `)
        .eq('target_org_id', orgId!)
        .eq('status', 'verified')
        .order('submitted_at', { ascending: false });
      if (error) throw error;
      return data as DragonSharePostWithRelations[];
    },
    enabled: !!orgId,
  });
}

// ── Creator: monthly submission count (for rate limiting) ───────────────────

export function useCreatorMonthlySubmissionCount() {
  const { user } = useAuth();
  return useQuery({
    queryKey: KEYS.creatorMonthlyCount(user?.id),
    queryFn: async () => {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);
      const { count, error } = await supabase
        .from('dragonshare_posts')
        .select('id', { count: 'exact', head: true })
        .eq('creator_id', user!.id)
        .gte('submitted_at', startOfMonth.toISOString());
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!user,
  });
}

// ── Creator: submit a new post ──────────────────────────────────────────────

export function useSubmitDragonSharePost() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (post: {
      platform: string;
      content_type: string;
      post_url: string;
      caption?: string;
      target_org_id: string;
      target_org_unit_id?: string;
      hashtags?: string[];
      mentions?: string[];
    }) => {
      const { data, error } = await supabase
        .from('dragonshare_posts')
        .insert({ ...post, creator_id: user!.id })
        .select()
        .single();
      if (error) throw error;
      return data as DragonSharePost;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEYS.creatorPosts(user?.id) });
      queryClient.invalidateQueries({ queryKey: KEYS.creatorMonthlyCount(user?.id) });
    },
  });
}

// ── Admin: fetch verification queue ─────────────────────────────────────────

export function useAdminDragonShareQueue() {
  return useQuery({
    queryKey: KEYS.adminQueue(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('dragonshare_posts')
        .select(`
          *,
          creator:profiles!dragonshare_posts_creator_id_fkey(id, full_name, avatar_url, email),
          target_org:organizations(id, name, logo_url)
        `)
        .eq('status', 'pending_verification')
        .order('submitted_at', { ascending: true });
      if (error) throw error;
      return data as DragonSharePostWithRelations[];
    },
  });
}

// ── Admin: approve or reject a post ─────────────────────────────────────────

export function useVerifyDragonSharePost() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      postId,
      action,
      rejectionReason,
    }: {
      postId: string;
      action: 'approve' | 'reject';
      rejectionReason?: string;
    }) => {
      if (action === 'approve') {
        const { error } = await supabase
          .from('dragonshare_posts')
          .update({
            status: 'verified',
            boost_status: 'available',
            verification_method: 'manual',
            verified_at: new Date().toISOString(),
            verified_by: user!.id,
          })
          .eq('id', postId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('dragonshare_posts')
          .update({
            status: 'rejected',
            rejection_reason: rejectionReason ?? 'Does not meet verification criteria',
          })
          .eq('id', postId);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEYS.adminQueue() });
    },
  });
}

// ── Org: boost stats for dashboard tile ─────────────────────────────────────

export function useOrgBoostStats(orgId?: string | null) {
  return useQuery({
    queryKey: KEYS.orgBoostStats(orgId ?? undefined),
    queryFn: async () => {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);
      const { data, error } = await supabase
        .from('dragonshare_boosts')
        .select('amount_cents')
        .eq('boosting_org_id', orgId!)
        .eq('status', 'transferred')
        .gte('boosted_at', startOfMonth.toISOString());
      if (error) throw error;
      const totalCents = (data ?? []).reduce((sum, b) => sum + b.amount_cents, 0);
      return { totalCents, count: data?.length ?? 0 };
    },
    enabled: !!orgId,
  });
}

// ── Creator: earnings stats for dashboard tile ──────────────────────────────

export function useCreatorDragonShareEarnings() {
  const { user } = useAuth();
  return useQuery({
    queryKey: KEYS.creatorEarningsStats(user?.id),
    queryFn: async () => {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);
      const { data, error } = await supabase
        .from('dragonshare_payouts')
        .select('amount_cents')
        .eq('creator_id', user!.id)
        .eq('status', 'succeeded')
        .gte('processed_at', startOfMonth.toISOString());
      if (error) throw error;
      const totalCents = (data ?? []).reduce((sum, p) => sum + p.amount_cents, 0);
      return { totalCents, count: data?.length ?? 0 };
    },
    enabled: !!user,
  });
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build 2>&1 | head -10`
Expected: Build passes (hooks may warn about unused exports, that's fine)

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useDragonShare.ts
git commit -m "feat(dragonshare): React Query hooks for posts, boosts, payouts, admin queue"
```

---

## Task 5: Navigation Updates

**Files:**
- Modify: `src/lib/navConfig.ts`

- [ ] **Step 1: Add Sparkles import and DragonShare to all three sidebar navs**

In `src/lib/navConfig.ts`, add `Sparkles` to the lucide-react import:

```typescript
import {
  // ... existing imports ...
  Sparkles,
} from 'lucide-react';
```

Add DragonShare entry to `creatorSidebarNav` between Earnings and Messages (after the `DollarSign` Earnings entry, before the `MessageSquare` Messages entry):

```typescript
  { icon: Sparkles, label: 'DragonShare', href: '/dashboard/creator/dragonshare' },
```

Add DragonShare entry to `businessSidebarNav` between UGC Campaigns and Messages:

```typescript
  { icon: Sparkles, label: 'DragonShare', href: '/dashboard/business/dragonshare' },
```

Add DragonShare entry to `brandSidebarNav` between Browse Creators and Messages:

```typescript
  { icon: Sparkles, label: 'DragonShare', href: '/dashboard/brand/dragonshare' },
```

- [ ] **Step 2: Add DragonShare to all three drawer menus**

Add to `creatorDrawerMenu` Navigation section (after Dragon Feed):

```typescript
  { icon: Sparkles, label: 'DragonShare', href: '/dashboard/creator/dragonshare' },
```

Add to `businessDrawerMenu` Navigation section (after UGC Campaigns):

```typescript
  { icon: Sparkles, label: 'DragonShare', href: '/dashboard/business/dragonshare' },
```

Add to `brandDrawerMenu` Navigation section (after Browse Creators):

```typescript
  { icon: Sparkles, label: 'DragonShare', href: '/dashboard/brand/dragonshare' },
```

- [ ] **Step 3: Verify build**

Run: `npm run build 2>&1 | head -5`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/lib/navConfig.ts
git commit -m "feat(dragonshare): add nav entries for all 3 roles (sidebar + drawer)"
```

---

## Task 6: Creator DragonShare Inbox Page (P3.2)

**Files:**
- Create: `src/pages/CreatorDragonShare.tsx`

- [ ] **Step 1: Build the creator inbox with 3 tabs**

```typescript
// src/pages/CreatorDragonShare.tsx

import { useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { useCreatorDragonSharePosts, useCreatorMonthlySubmissionCount } from '@/hooks/useDragonShare';
import { DragonShareSubmitSheet } from '@/components/dragonshare/DragonShareSubmitSheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sparkles, ExternalLink, Clock, CheckCircle, XCircle } from 'lucide-react';
import type { DragonSharePostWithRelations, PostStatus, BoostStatus } from '@/types/dragonshare';

type Tab = 'submitted' | 'boosted' | 'expired';

const CreatorDragonShare: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('submitted');
  const [submitOpen, setSubmitOpen] = useState(false);
  const { data: posts, isLoading } = useCreatorDragonSharePosts();
  const { data: monthlyCount } = useCreatorMonthlySubmissionCount();

  const FREE_LIMIT = 5;
  const canSubmit = (monthlyCount ?? 0) < FREE_LIMIT;

  const filteredPosts = (posts ?? []).filter((p) => {
    if (activeTab === 'submitted') return p.status === 'pending_verification' || p.status === 'verified';
    if (activeTab === 'boosted') return p.boost_status === 'boosted';
    return p.status === 'expired' || p.boost_status === 'expired';
  });

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: 'submitted', label: 'Submitted', count: (posts ?? []).filter((p) => p.status === 'pending_verification' || p.status === 'verified').length },
    { key: 'boosted', label: 'Boosted', count: (posts ?? []).filter((p) => p.boost_status === 'boosted').length },
    { key: 'expired', label: 'Expired', count: (posts ?? []).filter((p) => p.status === 'expired' || p.boost_status === 'expired').length },
  ];

  return (
    <DashboardLayout userRole="content_creator">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">DragonShare</h1>
            <p className="text-sm text-muted-foreground">
              Submit your organic posts and earn when brands boost them
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">
              {monthlyCount ?? 0}/{FREE_LIMIT} this month
            </span>
            <Button onClick={() => setSubmitOpen(true)} disabled={!canSubmit}>
              <Sparkles className="mr-2 h-4 w-4" />
              Submit Post
            </Button>
          </div>
        </div>

        <div className="flex gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? 'bg-teal-500 text-white'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {tab.label}
              {tab.count > 0 && (
                <Badge variant="secondary" className="ml-2">{tab.count}</Badge>
              )}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-2xl bg-muted" />
            ))}
          </div>
        ) : filteredPosts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-teal-300 p-8 text-center">
            <Sparkles className="mx-auto h-10 w-10 text-teal-400 mb-3" />
            <p className="font-medium">No posts here yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              {activeTab === 'submitted' ? 'Submit your first organic post to get started!' : 
               activeTab === 'boosted' ? 'When brands boost your posts, they\'ll appear here.' :
               'Expired posts will show up here.'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredPosts.map((post) => (
              <CreatorPostCard key={post.id} post={post} />
            ))}
          </div>
        )}
      </div>

      <DragonShareSubmitSheet open={submitOpen} onOpenChange={setSubmitOpen} />
    </DashboardLayout>
  );
};

function CreatorPostCard({ post }: { post: DragonSharePostWithRelations }) {
  const statusConfig: Record<PostStatus, { label: string; className: string; icon: React.ElementType }> = {
    pending_verification: { label: 'Awaiting verification', className: 'bg-yellow-100 text-yellow-800', icon: Clock },
    verified: { label: 'Verified', className: 'bg-green-100 text-green-800', icon: CheckCircle },
    rejected: { label: 'Rejected', className: 'bg-red-100 text-red-800', icon: XCircle },
    expired: { label: 'Expired', className: 'bg-gray-100 text-gray-800', icon: Clock },
  };

  const config = statusConfig[post.status];
  const StatusIcon = config.icon;
  const boost = post.boosts?.[0];

  return (
    <div className="rounded-2xl border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium capitalize">{post.platform}</span>
          <span className="text-xs text-muted-foreground capitalize">{post.content_type}</span>
        </div>
        <div className={`flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ${config.className}`}>
          <StatusIcon className="h-3 w-3" />
          {config.label}
        </div>
      </div>

      {post.caption && (
        <p className="text-sm text-muted-foreground line-clamp-2">{post.caption}</p>
      )}

      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          {post.target_org?.logo_url && (
            <img src={post.target_org.logo_url} alt="" className="h-5 w-5 rounded-full" />
          )}
          <span className="text-muted-foreground">{post.target_org?.name ?? 'Unknown org'}</span>
        </div>
        <div className="flex items-center gap-3">
          {boost && boost.status === 'transferred' && (
            <span className="font-semibold text-teal-600">
              +${(boost.creator_payout_cents / 100).toFixed(0)}
            </span>
          )}
          <a href={post.post_url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground">
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      </div>

      {post.status === 'rejected' && post.rejection_reason && (
        <p className="text-xs text-red-600 bg-red-50 rounded-lg p-2">{post.rejection_reason}</p>
      )}

      {post.donny_recommended_tier && post.status !== 'rejected' && (
        <div className="flex items-center gap-2 text-xs text-teal-600">
          <Sparkles className="h-3 w-3" />
          Donny recommends ${post.donny_recommended_tier} boost
          {post.donny_reach_estimate && ` · Est. reach: ${post.donny_reach_estimate.toLocaleString()}`}
        </div>
      )}
    </div>
  );
}

export default CreatorDragonShare;
```

- [ ] **Step 2: Verify build**

Run: `npm run build 2>&1 | head -10`
Expected: May warn about missing DragonShareSubmitSheet (created in next task). That's OK for now.

- [ ] **Step 3: Commit**

```bash
git add src/pages/CreatorDragonShare.tsx
git commit -m "feat(dragonshare): creator inbox page with status tabs"
```

---

## Task 7: Creator Submit Sheet Component (P3.2)

**Files:**
- Create: `src/components/dragonshare/DragonShareSubmitSheet.tsx`

- [ ] **Step 1: Build the 4-step submit flow**

```typescript
// src/components/dragonshare/DragonShareSubmitSheet.tsx

import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useSubmitDragonSharePost } from '@/hooks/useDragonShare';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { Sparkles, ArrowLeft, Check, Loader2 } from 'lucide-react';
import type { PostPlatform, ContentType } from '@/types/dragonshare';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const PLATFORMS: { value: PostPlatform; label: string }[] = [
  { value: 'instagram', label: 'Instagram' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'x', label: 'X' },
  { value: 'other', label: 'Other' },
];

const CONTENT_TYPES: { value: ContentType; label: string }[] = [
  { value: 'photo', label: 'Photo' },
  { value: 'video', label: 'Video' },
  { value: 'reel', label: 'Reel' },
  { value: 'story', label: 'Story' },
  { value: 'carousel', label: 'Carousel' },
];

export function DragonShareSubmitSheet({ open, onOpenChange }: Props) {
  const { toast } = useToast();
  const submitMutation = useSubmitDragonSharePost();

  const [step, setStep] = useState(1);
  const [platform, setPlatform] = useState<PostPlatform | null>(null);
  const [contentType, setContentType] = useState<ContentType | null>(null);
  const [postUrl, setPostUrl] = useState('');
  const [caption, setCaption] = useState('');
  const [targetOrgId, setTargetOrgId] = useState<string | null>(null);
  const [orgSearch, setOrgSearch] = useState('');

  const { data: orgs } = useQuery({
    queryKey: ['orgs-search', orgSearch],
    queryFn: async () => {
      const query = supabase
        .from('organizations')
        .select('id, name, logo_url, org_type')
        .is('deleted_at', null)
        .limit(10);
      if (orgSearch.trim()) {
        query.ilike('name', `%${orgSearch}%`);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: step === 3,
  });

  const selectedOrg = orgs?.find((o) => o.id === targetOrgId);

  function reset() {
    setStep(1);
    setPlatform(null);
    setContentType(null);
    setPostUrl('');
    setCaption('');
    setTargetOrgId(null);
    setOrgSearch('');
  }

  async function handleSubmit() {
    if (!platform || !contentType || !postUrl || !targetOrgId) return;
    try {
      await submitMutation.mutateAsync({
        platform,
        content_type: contentType,
        post_url: postUrl,
        caption: caption || undefined,
        target_org_id: targetOrgId,
      });
      toast({ title: 'Post submitted!', description: 'We\'ll verify it and notify the brand.' });
      reset();
      onOpenChange(false);
    } catch (err) {
      toast({ title: 'Submission failed', description: String(err), variant: 'destructive' });
    }
  }

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <SheetContent side="bottom" className="h-[85vh] rounded-t-3xl">
        <SheetHeader>
          <div className="flex items-center gap-2">
            {step > 1 && (
              <button onClick={() => setStep(step - 1)} className="p-1 rounded-full hover:bg-muted">
                <ArrowLeft className="h-5 w-5" />
              </button>
            )}
            <SheetTitle>Submit a Post</SheetTitle>
          </div>
          <div className="flex gap-1 mt-2">
            {[1, 2, 3, 4].map((s) => (
              <div key={s} className={`h-1 flex-1 rounded-full ${s <= step ? 'bg-teal-500' : 'bg-muted'}`} />
            ))}
          </div>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {step === 1 && (
            <div className="space-y-4">
              <p className="font-medium">Where did you post it?</p>
              <div className="flex flex-wrap gap-2">
                {PLATFORMS.map((p) => (
                  <button
                    key={p.value}
                    onClick={() => setPlatform(p.value)}
                    className={`rounded-full px-4 py-2 text-sm font-medium border transition-colors ${
                      platform === p.value ? 'bg-teal-500 text-white border-teal-500' : 'border-border hover:border-teal-300'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <p className="font-medium mt-4">What type of content?</p>
              <div className="flex flex-wrap gap-2">
                {CONTENT_TYPES.map((c) => (
                  <button
                    key={c.value}
                    onClick={() => setContentType(c.value)}
                    className={`rounded-full px-4 py-2 text-sm font-medium border transition-colors ${
                      contentType === c.value ? 'bg-teal-500 text-white border-teal-500' : 'border-border hover:border-teal-300'
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
              <Button className="w-full rounded-full" disabled={!platform || !contentType} onClick={() => setStep(2)}>
                Next
              </Button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <p className="font-medium">Paste the link</p>
              <Input
                placeholder="https://instagram.com/p/..."
                value={postUrl}
                onChange={(e) => setPostUrl(e.target.value)}
                className="rounded-full"
              />
              <p className="font-medium">Caption (optional)</p>
              <Input
                placeholder="Add a caption or leave blank"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                className="rounded-full"
              />
              <Button className="w-full rounded-full" disabled={!postUrl.trim()} onClick={() => setStep(3)}>
                Next
              </Button>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <p className="font-medium">Who'd you mention?</p>
              <Input
                placeholder="Search for a brand or restaurant..."
                value={orgSearch}
                onChange={(e) => setOrgSearch(e.target.value)}
                className="rounded-full"
              />
              <div className="grid grid-cols-2 gap-2 max-h-60 overflow-y-auto">
                {(orgs ?? []).map((org) => (
                  <button
                    key={org.id}
                    onClick={() => setTargetOrgId(org.id)}
                    className={`flex items-center gap-2 rounded-xl p-3 border transition-colors text-left ${
                      targetOrgId === org.id ? 'border-teal-500 bg-teal-50' : 'border-border hover:border-teal-300'
                    }`}
                  >
                    {org.logo_url ? (
                      <img src={org.logo_url} alt="" className="h-8 w-8 rounded-full ring-2 ring-teal-400" />
                    ) : (
                      <div className="h-8 w-8 rounded-full bg-teal-100 flex items-center justify-center text-xs font-bold text-teal-600">
                        {org.name.charAt(0)}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{org.name}</p>
                      <p className="text-xs text-muted-foreground capitalize">{org.org_type}</p>
                    </div>
                    {targetOrgId === org.id && <Check className="h-4 w-4 text-teal-500 ml-auto flex-shrink-0" />}
                  </button>
                ))}
              </div>
              <Button className="w-full rounded-full" disabled={!targetOrgId} onClick={() => setStep(4)}>
                Next
              </Button>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-teal-300 bg-teal-50/50 p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-teal-500" />
                  <p className="font-medium">Ready to submit</p>
                </div>
                <p className="text-sm text-muted-foreground">
                  We'll verify your post and send it to{' '}
                  <span className="font-medium text-foreground">{selectedOrg?.name}</span>'s inbox.
                  Donny will estimate your reach and recommend a boost tier.
                </p>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Platform</span>
                  <span className="capitalize">{platform}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Content</span>
                  <span className="capitalize">{contentType}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Link</span>
                  <span className="truncate max-w-[200px]">{postUrl}</span>
                </div>
              </div>
              <Button
                className="w-full rounded-full"
                onClick={handleSubmit}
                disabled={submitMutation.isPending}
              >
                {submitMutation.isPending ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Submitting...</>
                ) : (
                  <>Send to {selectedOrg?.name}</>
                )}
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build 2>&1 | head -10`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/dragonshare/DragonShareSubmitSheet.tsx
git commit -m "feat(dragonshare): 4-step creator submit sheet"
```

---

## Task 8: Donny DragonShare Score Edge Function (P3.2)

**Files:**
- Create: `supabase/functions/donny-dragonshare-score/index.ts`

- [ ] **Step 1: Build the scoring edge function**

```typescript
// supabase/functions/donny-dragonshare-score/index.ts

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  console.log(`[DONNY-DS-SCORE] ${step}${details ? ' - ' + JSON.stringify(details) : ''}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    const { post_id } = await req.json();
    if (!post_id) throw new Error("Missing post_id");

    logStep("Scoring post", { post_id });

    const { data: post, error: postError } = await supabase
      .from("dragonshare_posts")
      .select("*, creator:profiles!dragonshare_posts_creator_id_fkey(id, full_name)")
      .eq("id", post_id)
      .single();

    if (postError || !post) throw new Error(`Post not found: ${postError?.message}`);

    // Count creator's previous posts for engagement baseline
    const { count: creatorPostCount } = await supabase
      .from("dragonshare_posts")
      .select("id", { count: "exact", head: true })
      .eq("creator_id", post.creator_id)
      .eq("status", "verified");

    // Count boosts the target org has done previously
    const { count: orgBoostCount } = await supabase
      .from("dragonshare_boosts")
      .select("id", { count: "exact", head: true })
      .eq("boosting_org_id", post.target_org_id)
      .in("status", ["captured", "transferred"]);

    // Heuristic scoring (Claude API integration in v1.1)
    const platformMultiplier: Record<string, number> = {
      tiktok: 1.3, instagram: 1.2, youtube: 1.1, x: 0.9, facebook: 0.8, other: 0.7,
    };
    const contentMultiplier: Record<string, number> = {
      reel: 1.4, video: 1.3, carousel: 1.1, story: 0.9, photo: 1.0,
    };

    const baseReach = 1500;
    const platformFactor = platformMultiplier[post.platform] ?? 1.0;
    const contentFactor = contentMultiplier[post.content_type] ?? 1.0;
    const experienceFactor = Math.min(1.5, 1 + (creatorPostCount ?? 0) * 0.1);

    const estimatedReach = Math.round(baseReach * platformFactor * contentFactor * experienceFactor);
    const matchQuality = Math.min(100, Math.round(50 + (orgBoostCount ?? 0) * 5 + (creatorPostCount ?? 0) * 3));

    let recommendedTier: number;
    if (estimatedReach >= 5000) recommendedTier = 250;
    else if (estimatedReach >= 3000) recommendedTier = 100;
    else if (estimatedReach >= 1500) recommendedTier = 50;
    else recommendedTier = 25;

    const rationale = `${post.platform} ${post.content_type} with est. ${estimatedReach.toLocaleString()} reach. Creator has ${creatorPostCount ?? 0} verified posts.`;

    logStep("Score calculated", { estimatedReach, recommendedTier, matchQuality });

    // Write score back to post
    const { error: updateError } = await supabase
      .from("dragonshare_posts")
      .update({
        donny_recommended_tier: recommendedTier,
        donny_score: matchQuality,
        donny_reach_estimate: estimatedReach,
      })
      .eq("id", post_id);

    if (updateError) logStep("ERROR: Failed to update post score", { error: updateError.message });

    // Log event
    await supabase.from("dragonshare_events").insert({
      event_type: "donny_score_generated",
      actor_user_id: post.creator_id,
      post_id: post_id,
      payload: { estimatedReach, recommendedTier, matchQuality, rationale },
    });

    return new Response(JSON.stringify({
      estimated_reach: estimatedReach,
      recommended_tier: recommendedTier,
      match_quality: matchQuality,
      rationale,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: msg });
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/donny-dragonshare-score/index.ts
git commit -m "feat(dragonshare): Donny scoring edge function"
```

---

## Task 9: Admin Verification Queue Page (P3.2)

**Files:**
- Create: `src/pages/AdminDragonShareQueue.tsx`

- [ ] **Step 1: Build the admin queue page**

```typescript
// src/pages/AdminDragonShareQueue.tsx

import { useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { useAdminDragonShareQueue, useVerifyDragonSharePost } from '@/hooks/useDragonShare';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle, XCircle, ExternalLink, Loader2 } from 'lucide-react';
import type { UserRole } from '@/types/user';

const AdminDragonShareQueue: React.FC = () => {
  const { profile } = useAuth();
  const userRole = (profile?.role as UserRole) ?? 'content_creator';
  const { data: posts, isLoading } = useAdminDragonShareQueue();
  const verifyMutation = useVerifyDragonSharePost();
  const { toast } = useToast();
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  async function handleApprove(postId: string) {
    try {
      await verifyMutation.mutateAsync({ postId, action: 'approve' });
      toast({ title: 'Post approved', description: 'It\'s now visible to the target brand.' });
    } catch (err) {
      toast({ title: 'Approval failed', description: String(err), variant: 'destructive' });
    }
  }

  async function handleReject(postId: string) {
    try {
      await verifyMutation.mutateAsync({ postId, action: 'reject', rejectionReason });
      toast({ title: 'Post rejected', description: 'Creator has been notified.' });
      setRejectingId(null);
      setRejectionReason('');
    } catch (err) {
      toast({ title: 'Rejection failed', description: String(err), variant: 'destructive' });
    }
  }

  return (
    <DashboardLayout userRole={userRole}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">DragonShare Verification Queue</h1>
          <p className="text-sm text-muted-foreground">
            {posts?.length ?? 0} posts awaiting verification
          </p>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-32 animate-pulse rounded-2xl bg-muted" />
            ))}
          </div>
        ) : (posts ?? []).length === 0 ? (
          <div className="rounded-2xl border border-dashed p-8 text-center">
            <CheckCircle className="mx-auto h-10 w-10 text-green-400 mb-3" />
            <p className="font-medium">Queue is empty</p>
            <p className="text-sm text-muted-foreground">All posts have been reviewed.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {(posts ?? []).map((post) => (
              <div key={post.id} className="rounded-2xl border bg-card p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {post.creator?.avatar_url ? (
                      <img src={post.creator.avatar_url} alt="" className="h-10 w-10 rounded-full ring-2 ring-teal-400" />
                    ) : (
                      <div className="h-10 w-10 rounded-full bg-teal-100 flex items-center justify-center text-sm font-bold text-teal-600">
                        {post.creator?.full_name?.charAt(0) ?? '?'}
                      </div>
                    )}
                    <div>
                      <p className="font-medium">{post.creator?.full_name ?? 'Unknown'}</p>
                      <p className="text-xs text-muted-foreground capitalize">{post.platform} · {post.content_type}</p>
                    </div>
                  </div>
                  <div className="text-right text-sm">
                    <p className="font-medium">{post.target_org?.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(post.submitted_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                {post.caption && (
                  <p className="text-sm text-muted-foreground line-clamp-3">{post.caption}</p>
                )}

                <a
                  href={post.post_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-sm text-teal-600 hover:underline"
                >
                  <ExternalLink className="h-4 w-4" />
                  View original post
                </a>

                {rejectingId === post.id ? (
                  <div className="space-y-2">
                    <Input
                      placeholder="Rejection reason..."
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                    />
                    <div className="flex gap-2">
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleReject(post.id)}
                        disabled={!rejectionReason.trim() || verifyMutation.isPending}
                      >
                        {verifyMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirm Reject'}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => { setRejectingId(null); setRejectionReason(''); }}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="rounded-full"
                      onClick={() => handleApprove(post.id)}
                      disabled={verifyMutation.isPending}
                    >
                      <CheckCircle className="mr-1 h-4 w-4" />
                      Approve
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-full"
                      onClick={() => setRejectingId(post.id)}
                    >
                      <XCircle className="mr-1 h-4 w-4" />
                      Reject
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default AdminDragonShareQueue;
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/AdminDragonShareQueue.tsx
git commit -m "feat(dragonshare): admin verification queue page"
```

---

## Task 10: Brand/Restaurant DragonShare Inbox Page (P3.3)

**Files:**
- Create: `src/pages/BusinessDragonShare.tsx`
- Create: `src/components/dragonshare/DragonSharePostCard.tsx`
- Create: `src/components/dragonshare/BoostConfirmationSheet.tsx`

- [ ] **Step 1: Create the post card component**

```typescript
// src/components/dragonshare/DragonSharePostCard.tsx

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sparkles, ExternalLink, SkipForward } from 'lucide-react';
import { BoostConfirmationSheet } from './BoostConfirmationSheet';
import { BOOST_TIERS } from '@/types/dragonshare';
import type { DragonSharePostWithRelations, BoostTierLabel } from '@/types/dragonshare';

interface Props {
  post: DragonSharePostWithRelations;
  canBoost: boolean;
  onSkip: (postId: string) => void;
}

export function DragonSharePostCard({ post, canBoost, onSkip }: Props) {
  const [selectedTier, setSelectedTier] = useState<{ cents: number; label: BoostTierLabel } | null>(null);
  const isAlreadyBoosted = post.boost_status === 'boosted';

  return (
    <>
      <div className="rounded-2xl border bg-card overflow-hidden">
        {/* Header */}
        <div className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {post.creator?.avatar_url ? (
              <img src={post.creator.avatar_url} alt="" className="h-10 w-10 rounded-full ring-2 ring-teal-400" />
            ) : (
              <div className="h-10 w-10 rounded-full bg-teal-100 flex items-center justify-center text-sm font-bold text-teal-600">
                {post.creator?.full_name?.charAt(0) ?? '?'}
              </div>
            )}
            <div>
              <p className="font-medium">{post.creator?.full_name ?? 'Unknown Creator'}</p>
              <p className="text-xs text-muted-foreground capitalize">{post.platform} · {post.content_type}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a href={post.post_url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4 text-muted-foreground hover:text-foreground" />
            </a>
            <span className="text-xs text-muted-foreground">
              {new Date(post.submitted_at).toLocaleDateString()}
            </span>
          </div>
        </div>

        {/* Caption */}
        {post.caption && (
          <div className="px-4 pb-3">
            <p className="text-sm text-muted-foreground line-clamp-3">{post.caption}</p>
          </div>
        )}

        {/* Donny recommendation strip */}
        {post.donny_recommended_tier && !isAlreadyBoosted && (
          <div className="mx-4 mb-3 rounded-xl bg-teal-50 border border-teal-200 p-3 space-y-1">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-teal-500" />
              <span className="text-sm font-medium text-teal-700">
                Donny recommends: ${post.donny_recommended_tier} boost
              </span>
            </div>
            {post.donny_reach_estimate && (
              <p className="text-xs text-teal-600">
                Estimated reach: {post.donny_reach_estimate.toLocaleString()} views
              </p>
            )}
          </div>
        )}

        {/* Boost buttons or boosted badge */}
        <div className="px-4 pb-4">
          {isAlreadyBoosted ? (
            <Badge className="bg-teal-100 text-teal-700 border-teal-200">
              Boosted · ${((post.boosts?.[0]?.amount_cents ?? 0) / 100).toFixed(0)}
            </Badge>
          ) : canBoost ? (
            <div className="flex items-center gap-2">
              {BOOST_TIERS.map((tier) => (
                <Button
                  key={tier.label}
                  variant={tier.cents / 100 === post.donny_recommended_tier ? 'default' : 'outline'}
                  size="sm"
                  className="rounded-full flex-1"
                  onClick={() => setSelectedTier({ cents: tier.cents, label: tier.label })}
                >
                  {tier.display}
                  {tier.cents / 100 === post.donny_recommended_tier && (
                    <Sparkles className="ml-1 h-3 w-3" />
                  )}
                </Button>
              ))}
              <Button
                variant="ghost"
                size="sm"
                className="rounded-full"
                onClick={() => onSkip(post.id)}
              >
                <SkipForward className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Ask an admin to boost this.</p>
          )}
        </div>
      </div>

      {selectedTier && (
        <BoostConfirmationSheet
          open={!!selectedTier}
          onOpenChange={(open) => { if (!open) setSelectedTier(null); }}
          post={post}
          amountCents={selectedTier.cents}
          tierLabel={selectedTier.label}
        />
      )}
    </>
  );
}
```

- [ ] **Step 2: Create the boost confirmation sheet**

```typescript
// src/components/dragonshare/BoostConfirmationSheet.tsx

import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Sparkles, Loader2 } from 'lucide-react';
import { DRAGONSHARE_FEE_RATE } from '@/types/dragonshare';
import type { DragonSharePostWithRelations, BoostTierLabel } from '@/types/dragonshare';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  post: DragonSharePostWithRelations;
  amountCents: number;
  tierLabel: BoostTierLabel;
}

export function BoostConfirmationSheet({ open, onOpenChange, post, amountCents, tierLabel }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const platformFeeCents = Math.round(amountCents * DRAGONSHARE_FEE_RATE);
  const creatorPayoutCents = amountCents - platformFeeCents;

  const boostMutation = useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const res = await supabase.functions.invoke('boost-payment', {
        body: { post_id: post.id, amount_cents: amountCents, tier_label: tierLabel },
      });
      if (res.error) throw new Error(res.error.message);
      return res.data;
    },
    onSuccess: () => {
      toast({ title: 'Boost confirmed!', description: `$${(creatorPayoutCents / 100).toFixed(0)} is on its way to ${post.creator?.full_name}.` });
      queryClient.invalidateQueries({ queryKey: ['dragonshare-posts'] });
      onOpenChange(false);
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('CREATOR_PAYOUT_NOT_READY')) {
        toast({ title: 'Boost queued', description: "We've notified the creator to finish setup. Your boost is queued — you won't be charged until it's processed." });
        onOpenChange(false);
      } else {
        toast({ title: 'Boost failed', description: msg, variant: 'destructive' });
      }
    },
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-teal-500" />
            Confirm Boost
          </SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          <div className="text-center">
            <p className="text-2xl font-bold">${(amountCents / 100).toFixed(0)}</p>
            <p className="text-sm text-muted-foreground">boost to {post.creator?.full_name}</p>
          </div>

          <div className="rounded-xl bg-muted p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Creator gets</span>
              <span className="font-medium">${(creatorPayoutCents / 100).toFixed(2)} (80%)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">DragonCandy fee</span>
              <span className="font-medium">${(platformFeeCents / 100).toFixed(2)} (20%)</span>
            </div>
            <div className="border-t pt-2 flex justify-between font-semibold">
              <span>You pay</span>
              <span>${(amountCents / 100).toFixed(2)}</span>
            </div>
          </div>

          <Button
            className="w-full rounded-full"
            onClick={() => boostMutation.mutate()}
            disabled={boostMutation.isPending}
          >
            {boostMutation.isPending ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Processing...</>
            ) : (
              'Confirm Boost'
            )}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 3: Create the brand inbox page**

```typescript
// src/pages/BusinessDragonShare.tsx

import { useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { useOrgDragonSharePosts } from '@/hooks/useDragonShare';
import { useOrg } from '@/hooks/useOrgData';
import { useMyOrgRole } from '@/hooks/useOrgData';
import { useAuth } from '@/hooks/useAuth';
import { DragonSharePostCard } from '@/components/dragonshare/DragonSharePostCard';
import { Sparkles, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import type { UserRole } from '@/types/user';
import type { BoostStatus } from '@/types/dragonshare';

type Tab = 'available' | 'boosted' | 'all';

export function BusinessDragonSharePage({ userRole }: { userRole: UserRole }) {
  const { profile } = useAuth();
  const { data: org } = useOrg();
  const { data: myRole } = useMyOrgRole(org?.id);
  const { data: posts, isLoading } = useOrgDragonSharePosts(org?.id);
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>('available');

  const canBoost = myRole?.role === 'owner' || myRole?.role === 'admin';

  const filteredPosts = (posts ?? []).filter((p) => {
    if (activeTab === 'available') return p.boost_status === 'available';
    if (activeTab === 'boosted') return p.boost_status === 'boosted';
    return true;
  });

  const tabs: { key: Tab; label: string }[] = [
    { key: 'available', label: 'Available' },
    { key: 'boosted', label: 'Boosted' },
    { key: 'all', label: 'All Time' },
  ];

  function handleSkip(postId: string) {
    // Skip logic — could mark as withdrawn in future
    console.log('Skipped post', postId);
  }

  return (
    <DashboardLayout userRole={userRole}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-teal-500" />
            DragonShare
          </h1>
          <p className="text-sm text-muted-foreground">
            Creators talking about you. Tap to boost a creator's organic post.
          </p>
        </div>

        <div className="flex gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? 'bg-teal-500 text-white'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-48 animate-pulse rounded-2xl bg-muted" />
            ))}
          </div>
        ) : filteredPosts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-teal-300 p-8 text-center">
            <Users className="mx-auto h-10 w-10 text-teal-400 mb-3" />
            <p className="font-medium">No DragonShare posts yet</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
              Creators post about you organically all the time — when they submit those posts here, you'll see them. Want to invite your favorite creators directly?
            </p>
            <Button
              variant="outline"
              className="mt-4 rounded-full"
              onClick={() => navigate(userRole === 'business_client' ? '/dashboard/business/creators' : '/dashboard/brand/creators')}
            >
              Invite a Creator
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredPosts.map((post) => (
              <DragonSharePostCard
                key={post.id}
                post={post}
                canBoost={canBoost}
                onSkip={handleSkip}
              />
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

// Named exports for the two route wrappers
export function BusinessDragonShare() {
  return <BusinessDragonSharePage userRole="business_client" />;
}

export function BrandDragonShare() {
  return <BusinessDragonSharePage userRole="brand" />;
}

export default BusinessDragonShare;
```

- [ ] **Step 4: Verify build**

Run: `npm run build 2>&1 | head -10`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/components/dragonshare/DragonSharePostCard.tsx src/components/dragonshare/BoostConfirmationSheet.tsx src/pages/BusinessDragonShare.tsx
git commit -m "feat(dragonshare): brand/restaurant inbox with one-tap boost tiers"
```

---

## Task 11: Route Registration in App.tsx

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add imports at the top of App.tsx**

After the existing page imports (around line 74), add:

```typescript
import CreatorDragonShare from "./pages/CreatorDragonShare";
import { BusinessDragonShare, BrandDragonShare } from "./pages/BusinessDragonShare";
import AdminDragonShareQueue from "./pages/AdminDragonShareQueue";
```

- [ ] **Step 2: Add creator DragonShare route**

After the creator dragon-feed route (around line 430), add:

```typescript
                  {/* Creator DragonShare Route */}
                  <Route path="/dashboard/creator/dragonshare" element={
                    <ProtectedRoute>
                      <CreatorDragonShare />
                    </ProtectedRoute>
                  } />
```

- [ ] **Step 3: Add business DragonShare route**

After the business org routes (around line 304), add:

```typescript
                  <Route path="/dashboard/business/dragonshare" element={<ProtectedRoute><BusinessRoute><BusinessDragonShare /></BusinessRoute></ProtectedRoute>} />
```

- [ ] **Step 4: Add brand DragonShare route**

After the brand org routes (around line 375), add:

```typescript
                  <Route path="/dashboard/brand/dragonshare" element={<ProtectedRoute><BrandRoute><BrandDragonShare /></BrandRoute></ProtectedRoute>} />
```

- [ ] **Step 5: Add admin routes**

After the reviews route, add:

```typescript
                  {/* Admin DragonShare Routes */}
                  <Route path="/admin/dragonshare-queue" element={
                    <ProtectedRoute>
                      <AdminDragonShareQueue />
                    </ProtectedRoute>
                  } />
```

- [ ] **Step 6: Verify build**

Run: `npm run build 2>&1 | head -10`
Expected: Build passes

- [ ] **Step 7: Commit**

```bash
git add src/App.tsx
git commit -m "feat(dragonshare): register all DragonShare routes"
```

---

## Task 12: Boost Payment Edge Function (P3.4)

**Files:**
- Create: `supabase/functions/boost-payment/index.ts`

- [ ] **Step 1: Build the boost payment edge function**

```typescript
// supabase/functions/boost-payment/index.ts

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { calculateDragonShareFee } from "../_shared/dragonshare-fee.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  console.log(`[BOOST-PAYMENT] ${step}${details ? ' - ' + JSON.stringify(details) : ''}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY not configured");

    // Auth: verify the caller
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) throw new Error(`Auth failed: ${userError?.message}`);
    const userId = userData.user.id;

    const { post_id, amount_cents, tier_label } = await req.json();
    if (!post_id || !amount_cents || !tier_label) throw new Error("Missing required fields");

    logStep("Boost requested", { post_id, amount_cents, tier_label, userId });

    // Fetch the post to get creator_id
    const { data: post, error: postError } = await supabase
      .from("dragonshare_posts")
      .select("id, creator_id, target_org_id, status, boost_status")
      .eq("id", post_id)
      .single();
    if (postError || !post) throw new Error(`Post not found: ${postError?.message}`);

    // Determine the boosting org from user's membership on the target org
    const { data: membership, error: memError } = await supabase
      .from("org_members")
      .select("org_id, role")
      .eq("user_id", userId)
      .eq("org_id", post.target_org_id)
      .eq("invitation_status", "active")
      .single();
    if (memError || !membership) throw new Error("Not a member of the target organization");
    if (!['owner', 'admin'].includes(membership.role)) throw new Error("Only owners and admins can boost");

    // Call create_boost security definer
    const { data: boostId, error: boostError } = await supabase.rpc("create_boost", {
      p_post_id: post_id,
      p_boosting_org_id: membership.org_id,
      p_amount_cents: amount_cents,
      p_tier: tier_label,
    });
    if (boostError) throw new Error(`create_boost failed: ${boostError.message}`);

    logStep("Boost row created", { boostId });

    // Check if creator has Stripe Connect
    const { data: creatorProfile, error: creatorError } = await supabase
      .from("creator_profiles")
      .select("stripe_account_id, stripe_onboarding_complete")
      .eq("user_id", post.creator_id)
      .single();

    if (creatorError || !creatorProfile?.stripe_account_id || !creatorProfile?.stripe_onboarding_complete) {
      logStep("Creator payout not ready — parking boost", { creatorId: post.creator_id });
      return new Response(JSON.stringify({
        error: "CREATOR_PAYOUT_NOT_READY",
        boost_id: boostId,
        message: "Creator hasn't finished payout setup. Boost is queued.",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 202,
      });
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const { platformFeeCents, creatorPayoutCents } = calculateDragonShareFee(amount_cents);

    // Fetch org's Stripe customer for charging
    const { data: org } = await supabase
      .from("organizations")
      .select("stripe_customer_id")
      .eq("id", membership.org_id)
      .single();

    // Create PaymentIntent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount_cents,
      currency: "usd",
      customer: org?.stripe_customer_id ?? undefined,
      confirm: true,
      automatic_payment_methods: { enabled: true, allow_redirects: "never" },
      metadata: {
        type: "dragonshare_boost",
        boost_id: boostId,
        post_id: post_id,
        boosting_org_id: membership.org_id,
        creator_id: post.creator_id,
      },
    }, { idempotencyKey: `boost_pi_${boostId}` });

    logStep("PaymentIntent created", { piId: paymentIntent.id, status: paymentIntent.status });

    if (paymentIntent.status !== "succeeded") {
      await supabase
        .from("dragonshare_boosts")
        .update({ status: "failed", stripe_payment_intent_id: paymentIntent.id })
        .eq("id", boostId);
      throw new Error(`Payment not succeeded: ${paymentIntent.status}`);
    }

    // Transfer to creator
    const transfer = await stripe.transfers.create({
      amount: creatorPayoutCents,
      currency: "usd",
      destination: creatorProfile.stripe_account_id,
      metadata: {
        type: "dragonshare_boost",
        boost_id: boostId,
        post_id: post_id,
      },
    }, { idempotencyKey: `boost_tr_${boostId}` });

    logStep("Transfer created", { transferId: transfer.id, amount: creatorPayoutCents });

    // Update boost row
    await supabase
      .from("dragonshare_boosts")
      .update({
        status: "transferred",
        stripe_payment_intent_id: paymentIntent.id,
        stripe_transfer_id: transfer.id,
        captured_at: new Date().toISOString(),
        transferred_at: new Date().toISOString(),
      })
      .eq("id", boostId);

    // Insert payout record
    await supabase
      .from("dragonshare_payouts")
      .insert({
        boost_id: boostId,
        creator_id: post.creator_id,
        amount_cents: creatorPayoutCents,
        stripe_transfer_id: transfer.id,
        status: "succeeded",
        processed_at: new Date().toISOString(),
      });

    // Update post status
    await supabase
      .from("dragonshare_posts")
      .update({ boost_status: "boosted" })
      .eq("id", post_id);

    logStep("Boost complete", { boostId, piId: paymentIntent.id, transferId: transfer.id });

    return new Response(JSON.stringify({
      success: true,
      boost_id: boostId,
      transfer_id: transfer.id,
      creator_payout_cents: creatorPayoutCents,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: msg });
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/boost-payment/index.ts
git commit -m "feat(dragonshare): boost-payment edge function with Stripe split"
```

---

## Task 13: Extend Stripe Webhook for Boost Events (P3.4)

**Files:**
- Modify: `supabase/functions/stripe-webhook/index.ts`

- [ ] **Step 1: Add boost-specific handler cases**

In the `switch (event.type)` block in `stripe-webhook/index.ts`, add the following cases before the `default:` case. The webhook already handles `payment_intent.payment_failed` and `transfer.updated` — we extend the existing handlers to check for boost metadata.

In the `payment_intent.payment_failed` handler, after the existing sponsorship handling block (around line where `metadata.sponsorship_id` is checked), add:

```typescript
        // DragonShare boost payment failed
        if (metadata.type === "dragonshare_boost" && metadata.boost_id) {
          await supabase
            .from("dragonshare_boosts")
            .update({ status: "failed" })
            .eq("id", metadata.boost_id)
            .eq("status", "pending");

          await supabase.from("dragonshare_events").insert({
            event_type: "boost_failed",
            actor_org_id: metadata.boosting_org_id,
            post_id: metadata.post_id,
            boost_id: metadata.boost_id,
            payload: { failure_message: failureMessage },
          });

          logStep("DragonShare boost payment failed", { boostId: metadata.boost_id });
        }
```

In the `transfer.updated` handler (which fires when `transfer.reversed` is true), after the existing collaboration handling, add:

```typescript
        // DragonShare boost transfer failed
        if (metadata.type === "dragonshare_boost" && metadata.boost_id) {
          await supabase
            .from("dragonshare_boosts")
            .update({ status: "failed" })
            .eq("id", metadata.boost_id);

          await supabase
            .from("dragonshare_payouts")
            .update({ status: "reversed", failure_reason: "Transfer reversed" })
            .eq("boost_id", metadata.boost_id);

          await supabase.from("dragonshare_events").insert({
            event_type: "boost_failed",
            post_id: metadata.post_id,
            boost_id: metadata.boost_id,
            payload: { failure_message: (transfer as any).failure_message, reversed: true },
          });

          logStep("DragonShare boost transfer reversed", { boostId: metadata.boost_id });
        }
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/stripe-webhook/index.ts
git commit -m "feat(dragonshare): webhook handlers for boost payment events"
```

---

## Task 14: Dashboard Stat Tiles (P3.4)

**Files:**
- Create: `src/components/dragonshare/DragonShareStatTile.tsx`
- Modify: `src/pages/CreatorDashboard.tsx` (minor — add tile)
- Modify: `src/pages/BusinessDashboard.tsx` (minor — add tile)
- Modify: `src/pages/BrandDashboard.tsx` (minor — add tile)

- [ ] **Step 1: Create the stat tile component**

```typescript
// src/components/dragonshare/DragonShareStatTile.tsx

import { Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';

interface Props {
  label: string;
  totalCents: number;
  count: number;
  href: string;
}

export function DragonShareStatTile({ label, totalCents, count, href }: Props) {
  if (count === 0) return null;

  return (
    <Link to={href} className="block rounded-2xl border border-teal-200 bg-teal-50/50 p-4 hover:bg-teal-50 transition-colors">
      <div className="flex items-center gap-2 mb-1">
        <Sparkles className="h-4 w-4 text-teal-500" />
        <span className="text-xs font-medium text-teal-700">{label}</span>
      </div>
      <p className="text-xl font-bold">${(totalCents / 100).toFixed(0)}</p>
      <p className="text-xs text-muted-foreground">{count} boost{count !== 1 ? 's' : ''} this month</p>
    </Link>
  );
}
```

- [ ] **Step 2: Add stat tile to each dashboard page**

In each dashboard page, import the tile and the relevant hook, then render the tile in the stats/overview area.

**Creator Dashboard** — add import and render:
```typescript
import { DragonShareStatTile } from '@/components/dragonshare/DragonShareStatTile';
import { useCreatorDragonShareEarnings } from '@/hooks/useDragonShare';
// Inside component:
const { data: dsEarnings } = useCreatorDragonShareEarnings();
// In JSX stats area:
<DragonShareStatTile
  label="DragonShare earnings"
  totalCents={dsEarnings?.totalCents ?? 0}
  count={dsEarnings?.count ?? 0}
  href="/dashboard/creator/dragonshare"
/>
```

**Business Dashboard** — add import and render:
```typescript
import { DragonShareStatTile } from '@/components/dragonshare/DragonShareStatTile';
import { useOrgBoostStats } from '@/hooks/useDragonShare';
import { useOrg } from '@/hooks/useOrgData';
// Inside component:
const { data: org } = useOrg();
const { data: dsBoosts } = useOrgBoostStats(org?.id);
// In JSX stats area:
<DragonShareStatTile
  label="DragonShare boosts"
  totalCents={dsBoosts?.totalCents ?? 0}
  count={dsBoosts?.count ?? 0}
  href="/dashboard/business/dragonshare"
/>
```

**Brand Dashboard** — same pattern as Business but with `href="/dashboard/brand/dragonshare"`.

- [ ] **Step 3: Verify build**

Run: `npm run build 2>&1 | head -10`
Expected: Build passes

- [ ] **Step 4: Commit**

```bash
git add src/components/dragonshare/DragonShareStatTile.tsx src/pages/CreatorDashboard.tsx src/pages/BusinessDashboard.tsx src/pages/BrandDashboard.tsx
git commit -m "feat(dragonshare): dashboard stat tiles for boost/earnings"
```

---

## Task 15: Admin Reconciliation Ledger Page (P3.4)

**Files:**
- Create: `src/pages/AdminDragonShareLedger.tsx`

- [ ] **Step 1: Build the reconciliation page**

```typescript
// src/pages/AdminDragonShareLedger.tsx

import { useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Download, Sparkles } from 'lucide-react';
import type { UserRole } from '@/types/user';

const AdminDragonShareLedger: React.FC = () => {
  const { profile } = useAuth();
  const userRole = (profile?.role as UserRole) ?? 'content_creator';

  const { data: boosts, isLoading } = useQuery({
    queryKey: ['admin-dragonshare-ledger'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('dragonshare_boosts')
        .select(`
          id, amount_cents, platform_fee_cents, creator_payout_cents, status, boosted_at, tier_label,
          post:dragonshare_posts(id, creator_id, platform, content_type,
            creator:profiles!dragonshare_posts_creator_id_fkey(full_name)),
          org:organizations!dragonshare_boosts_boosting_org_id_fkey(name)
        `)
        .order('boosted_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const stats = (boosts ?? []).reduce(
    (acc, b) => {
      if (b.status === 'transferred') {
        acc.grossCents += b.amount_cents;
        acc.feeCents += b.platform_fee_cents;
        acc.payoutCents += b.creator_payout_cents;
      } else if (b.status === 'refunded') {
        acc.refundCents += b.amount_cents;
      } else if (b.status === 'failed') {
        acc.failures += 1;
      }
      return acc;
    },
    { grossCents: 0, feeCents: 0, payoutCents: 0, refundCents: 0, failures: 0 }
  );

  function exportCsv() {
    const rows = [['Date', 'Creator', 'Org', 'Tier', 'Gross', 'Fee', 'Payout', 'Status']];
    (boosts ?? []).forEach((b) => {
      rows.push([
        new Date(b.boosted_at).toISOString(),
        (b.post as any)?.creator?.full_name ?? '',
        (b.org as any)?.name ?? '',
        b.tier_label,
        (b.amount_cents / 100).toFixed(2),
        (b.platform_fee_cents / 100).toFixed(2),
        (b.creator_payout_cents / 100).toFixed(2),
        b.status,
      ]);
    });
    const csv = rows.map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dragonshare-ledger-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <DashboardLayout userRole={userRole}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Sparkles className="h-6 w-6 text-teal-500" />
              DragonShare Ledger
            </h1>
            <p className="text-sm text-muted-foreground">Reconciliation report</p>
          </div>
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
        </div>

        {/* Stats summary */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {[
            { label: 'Gross Volume', value: `$${(stats.grossCents / 100).toFixed(0)}` },
            { label: 'Platform Revenue (20%)', value: `$${(stats.feeCents / 100).toFixed(0)}` },
            { label: 'Creator Payouts (80%)', value: `$${(stats.payoutCents / 100).toFixed(0)}` },
            { label: 'Refunds', value: `$${(stats.refundCents / 100).toFixed(0)}` },
            { label: 'Failures', value: String(stats.failures) },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border p-4">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className="text-xl font-bold">{s.value}</p>
            </div>
          ))}
        </div>

        {/* Boost table */}
        {isLoading ? (
          <div className="h-48 animate-pulse rounded-2xl bg-muted" />
        ) : (
          <div className="rounded-2xl border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left p-3 font-medium">Date</th>
                  <th className="text-left p-3 font-medium">Creator</th>
                  <th className="text-left p-3 font-medium">Org</th>
                  <th className="text-right p-3 font-medium">Gross</th>
                  <th className="text-right p-3 font-medium">Fee</th>
                  <th className="text-right p-3 font-medium">Payout</th>
                  <th className="text-left p-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {(boosts ?? []).map((b) => (
                  <tr key={b.id} className="border-t">
                    <td className="p-3">{new Date(b.boosted_at).toLocaleDateString()}</td>
                    <td className="p-3">{(b.post as any)?.creator?.full_name ?? '—'}</td>
                    <td className="p-3">{(b.org as any)?.name ?? '—'}</td>
                    <td className="p-3 text-right">${(b.amount_cents / 100).toFixed(2)}</td>
                    <td className="p-3 text-right">${(b.platform_fee_cents / 100).toFixed(2)}</td>
                    <td className="p-3 text-right">${(b.creator_payout_cents / 100).toFixed(2)}</td>
                    <td className="p-3">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        b.status === 'transferred' ? 'bg-green-100 text-green-700' :
                        b.status === 'failed' ? 'bg-red-100 text-red-700' :
                        b.status === 'refunded' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {b.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default AdminDragonShareLedger;
```

- [ ] **Step 2: Add route to App.tsx**

After the admin queue route, add:

```typescript
                  <Route path="/admin/dragonshare-ledger" element={
                    <ProtectedRoute>
                      <AdminDragonShareLedger />
                    </ProtectedRoute>
                  } />
```

And add the import at the top:
```typescript
import AdminDragonShareLedger from "./pages/AdminDragonShareLedger";
```

- [ ] **Step 3: Verify build**

Run: `npm run build 2>&1 | head -10`
Expected: Build passes

- [ ] **Step 4: Commit**

```bash
git add src/pages/AdminDragonShareLedger.tsx src/App.tsx
git commit -m "feat(dragonshare): admin reconciliation ledger with CSV export"
```

---

## Task 16: Final Build Verification + Integration Commit

- [ ] **Step 1: Full build check**

Run: `npm run build`
Expected: Build succeeds with no errors

- [ ] **Step 2: Verify all new files are tracked**

Run: `git status`
Expected: All new files are staged or committed. No untracked DragonShare files remain.

- [ ] **Step 3: Verify route accessibility**

Run: `npm run dev` and manually check in browser:
- `/dashboard/creator/dragonshare` — shows creator inbox with submit button
- `/dashboard/business/dragonshare` — shows brand inbox (empty state)
- `/dashboard/brand/dragonshare` — shows brand inbox (empty state)
- `/admin/dragonshare-queue` — shows empty verification queue
- `/admin/dragonshare-ledger` — shows empty ledger

- [ ] **Step 4: Verify navigation entries**

Check that "DragonShare" appears in the sidebar for all three roles (creator, business, brand) and in the drawer menus.

- [ ] **Step 5: Final summary commit if needed**

If any fixups were made during verification:
```bash
git add -A
git commit -m "fix(dragonshare): build and integration fixes"
```
