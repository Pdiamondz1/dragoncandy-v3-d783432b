# DragonShare Design Spec

**Date:** 2026-04-27
**Scope:** Playbook Section 4 (P3.1 - P3.4)
**Status:** Approved

## Overview

DragonShare converts creators' free organic social media content into a revenue stream. Creators submit posts mentioning brands/restaurants, those posts are verified, then brands can "boost" (retroactively pay for) the content. DragonCandy takes 20%, creator gets 80%.

**Brand Boost** ships first. Schema supports Performance Bounty and Affiliate QR in v1.1 without migration.

## Pricing & Verification

- Brand sets four preset boost tiers: $25 / $50 / $100 / $250
- Donny pre-selects the recommended tier from creator reach x post type x predicted performance
- Creator uploads link or screenshot for verification at MVP; social-API auto-verify in v1.1
- DragonCandy take rate: **20%** (creator gets 80%, brand pays gross)

## Codebase Reconciliation

These codebase realities differ from playbook assumptions and inform the implementation:

| Playbook Assumes | Codebase Reality | Adaptation |
|---|---|---|
| `payment_ledger` table | `payment_events` (append-only ledger) | DragonShare payouts mirror `payment_events` pattern |
| `processed_webhook_events` | `stripe_webhook_events` table | Reuse existing idempotency table for boost events |
| `creator_stripe_account_id` on profiles | `creator_profiles.stripe_account_id` | Join through `creator_profiles` table |
| Shared platform fee | `_shared/platform-fee.ts` at 5% | Create `_shared/dragonshare-fee.ts` at 20% |
| Nav has room for "Boost" entry | Bottom nav has 5 fixed slots | Add DragonShare to sidebar nav; bottom nav center Donny opens submit sheet |

## P3.1 — Schema Migration

**File:** `supabase/migrations/20260427000000_dragonshare.sql`

### Tables

**`dragonshare_posts`** — Creator-submitted organic content
- `id` uuid PK
- `creator_id` uuid references profiles(user_id)
- `target_org_id` uuid references organizations(id)
- `target_org_unit_id` uuid references org_units(id) nullable
- `monetization_type` text ('brand_boost' | 'performance_bounty' | 'affiliate') default 'brand_boost'
- `content_type` text ('photo' | 'video' | 'reel' | 'story' | 'carousel')
- `platform` text ('instagram' | 'tiktok' | 'youtube' | 'x' | 'facebook' | 'other')
- `post_url` text, `screenshot_url` text, `caption` text
- `hashtags` text[], `mentions` text[]
- `status` text default 'pending_verification' ('pending_verification' | 'verified' | 'rejected' | 'expired')
- `verification_method` text, `verified_at` timestamptz, `verified_by` uuid, `rejection_reason` text
- `donny_recommended_tier` int, `donny_score` numeric, `donny_reach_estimate` int
- `boost_status` text default 'available' ('available' | 'boosted' | 'expired' | 'withdrawn')
- `submitted_at`, `expires_at` (default +30 days), `created_at`, `updated_at`
- Indexes: (target_org_id, boost_status, submitted_at desc), (creator_id, submitted_at desc), (status)

**`dragonshare_boosts`** — Brand payments for boosted posts
- `id` uuid PK
- `post_id` uuid references dragonshare_posts(id)
- `boosting_org_id` uuid references organizations(id)
- `boosting_user_id` uuid references auth.users(id)
- `amount_cents` int, `tier_label` text ('25' | '50' | '100' | '250' | 'custom')
- `platform_fee_cents` int (20%), `creator_payout_cents` int (80%)
- `stripe_payment_intent_id` text, `stripe_transfer_id` text
- `status` text default 'pending' ('pending' | 'captured' | 'transferred' | 'refunded' | 'failed')
- `boosted_at`, `captured_at`, `transferred_at`

**`dragonshare_payouts`** — Mirrors payment_events pattern for creator payouts
- `id` uuid PK
- `boost_id` uuid references dragonshare_boosts(id)
- `creator_id` uuid references profiles(user_id)
- `amount_cents` int, `stripe_transfer_id` text
- `status` text ('pending' | 'succeeded' | 'failed' | 'reversed')
- `failure_reason` text, `processed_at` timestamptz

**`dragonshare_events`** — Data flywheel for Donny's matching algorithm
- `id` uuid PK
- `event_type` text ('post_submitted' | 'post_verified' | 'donny_score_generated' | 'boost_offered' | 'boost_accepted' | 'boost_failed' | 'view_count_updated' | 'engagement_recorded')
- `actor_user_id` uuid, `actor_org_id` uuid
- `post_id` uuid references dragonshare_posts(id)
- `boost_id` uuid references dragonshare_boosts(id)
- `payload` jsonb, `created_at` timestamptz
- Indexes: (event_type, created_at desc), (post_id, created_at)

**`dragonshare_engagement`** — For v1.1 social API (schema only at MVP)
- `id` uuid PK, `post_id` uuid references dragonshare_posts(id)
- `measured_at` timestamptz, `source` text
- Metrics: view_count, like_count, comment_count, share_count, save_count, reach, impressions
- Index: (post_id, measured_at desc)

### RLS Policies

- **dragonshare_posts**: Creator reads own; org members read posts targeting their org; creator inserts own; creator updates limited fields (caption, post_url)
- **dragonshare_boosts**: Creator reads boosts on own posts; boosting org members read their boosts; INSERT only via `create_boost` security definer
- **dragonshare_payouts**: Creator reads own only; INSERT by service role only
- **dragonshare_events**: Service role only (analytics)
- **dragonshare_engagement**: Creator and boosting orgs read; service role inserts

### Security Definer Function — `create_boost`

Inputs: p_post_id, p_boosting_org_id, p_amount_cents, p_tier. Validates post is verified and not already boosted, boosting user is owner/admin of org, amount matches valid tier. Creates boost row with status='pending', returns boost_id.

### Event Logging Triggers

- dragonshare_posts INSERT -> 'post_submitted'
- dragonshare_posts status UPDATE to 'verified' -> 'post_verified'
- dragonshare_boosts INSERT -> 'boost_offered'
- dragonshare_boosts status UPDATE to 'transferred' -> 'boost_accepted'

## P3.2 — Creator Submit Flow

### Navigation

- Add "DragonShare" to `creatorSidebarNav` in `src/lib/navConfig.ts` between Earnings and Messages
- Route: `/dashboard/creator/dragonshare`
- Bottom nav: center Donny button can open submit sheet directly (existing pattern)

### Submit Sheet (4 steps, total taps: 4, typing: 1 paste)

1. **Platform selection**: Pill row (Instagram | TikTok | YouTube | X | Other)
2. **Paste link**: Single input, preview thumbnail on valid URL
3. **Target org**: Search field with org tiles, Donny pre-suggests from caption parsing
4. **Confirm**: Donny shows estimated reach + recommended tier, "Send to [Org]" button

### Edge Function — `donny-dragonshare-score`

> **REMOVED 2026-08-08 — do not rebuild from this section.** The function shipped without an
> authorization check (the authenticated caller was validated then never used, so a body-supplied
> `post_id` reached a service-role read *and write* of any tenant's post), and the INSERT webhook
> below was never wired, so it never ran once on prod. If post scoring is wanted later, it needs a
> caller→`target_org_id` membership check and a caller-attributed audit row. See
> [[Service-Role Data Exposure]].

- Path: `supabase/functions/donny-dragonshare-score/index.ts`
- Triggered on dragonshare_posts INSERT (via webhook or called after insert)
- Pulls creator engagement averages, target org boost history, content_type, platform
- Returns: estimated_reach, recommended_tier (25|50|100|250), match_quality (0-100), rationale
- Writes back to dragonshare_posts and logs event

### Creator DragonShare Inbox

- Route: `/dashboard/creator/dragonshare`
- Three tabs: Submitted (pending verification) | Boosted (with amount + payout date) | Expired

### Admin Verification Queue

- Route: `/admin/dragonshare-queue`
- Lists status='pending_verification' posts
- Approve -> 'verified' + boost_status='available' | Reject -> 'rejected' + notification to creator

### Rate Limiting

- Free creators: 5 DragonShare submissions/month
- Enforced in edge function with hard count

## P3.3 — Brand/Restaurant Inbox

### Routes

- Business: `/dashboard/business/dragonshare`
- Brand: `/dashboard/brand/dragonshare`
- Add "DragonShare" to both `businessSidebarNav` and `brandSidebarNav` in navConfig.ts

### Post Card Layout

- Creator avatar + name + tier badge + platform icon + date
- Post preview (thumbnail + caption)
- Donny recommendation strip (teal): recommended tier, estimated reach, rationale
- Boost row: [$25] [$50 sparkle] [$100] [$250] [Skip] — recommended tier visually weighted
- Custom amount link (owner only, $5 minimum)

### Boost Confirmation Sheet

- Amount breakdown: Creator gets 80%, DragonCandy fee 20%, total charged
- "Confirm Boost" button -> calls boost-payment edge function (P3.4)

### Permission Gating

- Owner: full access, can boost
- Admin: can boost (configurable limit)
- Standard: can VIEW but not boost; toast: "Ask an admin to boost this."

### Empty States

- No posts: invite creators CTA
- No posts in filter: contextual message

## P3.4 — Boost Payment + Stripe Split

### Edge Function — `boost-payment`

- Path: `supabase/functions/boost-payment/index.ts`
- Auth: owner or admin of boosting org
- Flow:
  1. Call `create_boost` security definer -> boost row with status='pending'
  2. Verify creator has Stripe Connect (`creator_profiles.stripe_account_id`)
  3. If no Stripe Connect: fail with 'CREATOR_PAYOUT_NOT_READY', park boost
  4. Create Stripe PaymentIntent for amount_cents
  5. On capture: Stripe Transfer to creator for 80%
  6. Update boost status='transferred', record stripe IDs
  7. Insert dragonshare_payouts row
  8. Log 'boost_accepted' event
  9. Update post boost_status='boosted'

### Fee Calculation

- New file: `supabase/functions/_shared/dragonshare-fee.ts`
- `DRAGONSHARE_FEE_RATE = 0.20` (20%)
- Separate from campaign `PLATFORM_FEE_RATE = 0.05`

### Webhook Handling

- Extend `stripe-webhook/index.ts` for:
  - `payment_intent.succeeded` -> confirm boost capture
  - `payment_intent.payment_failed` -> mark boost 'failed', notify brand
  - `transfer.failed` -> mark boost 'failed', refund brand, notify both
- Reuse `stripe_webhook_events` idempotency table

### Parked-Boost Processor

- Cron (pg_cron, hourly): expire boosts pending >7 days, auto-process when creator completes Stripe onboarding

### Failure UX

- Card declined: inline retry banner with link to /org/billing
- Creator not ready: "We've notified the creator. Your boost is queued."

### Dashboard Stats

- Brand: "DragonShare boosts: $X this month"
- Creator: "DragonShare earnings: $X this month"

### Admin Reconciliation

- Route: `/admin/dragonshare-ledger`
- Daily totals: gross volume, platform revenue (20%), creator payouts (80%), refunds, failures
- CSV export

## PROTECT Rules

- Do NOT modify `payment_events` table
- Do NOT modify campaign payment logic or `platform-fee.ts`
- Do NOT change Stripe webhook signature verification
- Do NOT modify creator profile schema (Stripe Connect ID stays where it is)
- Do NOT touch portfolio upload flow
- Preserve all `lg:` responsive classes
- No new dependencies
