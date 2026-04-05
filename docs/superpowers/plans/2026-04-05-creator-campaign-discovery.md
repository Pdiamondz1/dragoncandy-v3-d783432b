# Creator Campaign Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the creator-facing campaign discovery flow so creators see full campaign details (title, budget, deliverables, media, business info) instead of placeholder content.

**Architecture:** Surgical rebuild of existing components. Enhance `CampaignSwipeCard` CardContent with real data, add a new full-screen `CampaignDetailModal` with inline apply form, enhance `usePublicCampaigns` with media/deliverable data, add tab bar with Applied tab. No route changes, no schema changes.

**Tech Stack:** React + TypeScript, Tailwind CSS, React Query (TanStack), Supabase JS client v2, react-tinder-card (existing), Lucide icons

**Spec:** `docs/superpowers/specs/2026-04-04-creator-campaign-discovery-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/lib/campaignUtils.ts` | **Create** | `mapDeliveryType()`, `getRelativeTime()`, `calculateDistance()`, `formatBudget()`, `getCoverImageUrl()` utilities. Note: `calculateDistance()` is created for future use but not called in Phase 1. |
| `src/hooks/useCampaignQueries.ts` | **Modify** | Add `ai_preview_status` to `Campaign` interface (needed for cover image fallback chain) |
| `src/hooks/usePublicCampaigns.ts` | **Modify** | Add cover image URL, deliverable count, content types to enriched campaign data |
| `src/hooks/useCampaignDetail.ts` | **Create** | Fetch campaign_media + campaign_deliverables for detail modal |
| `src/hooks/useCreatorApplications.ts` | **Create** | Fetch creator's applications with joined campaign + business data |
| `src/components/campaigns/CampaignSwipeCard.tsx` | **Modify** | Rebuild CardContent with rich data, cover image fallback, delivery badge fix, tap-to-open-modal |
| `src/components/campaigns/CampaignDetailModal.tsx` | **Create** | Full-screen scrollable modal: campaign brief, media gallery, deliverables, business info, sticky apply CTA |
| `src/components/campaigns/CampaignApplyForm.tsx` | **Create** | Inline application form: rate input, date pills, quick pitch, DragonDash urgency |
| `src/components/campaigns/CreatorApplicationCard.tsx` | **Create** | Card for Applied tab: status badge, campaign info, action CTA |
| `src/pages/CreatorCampaignMarketplace.tsx` | **Modify** | Add tab bar, modal state, integrate detail modal + applied tab |

### Protected Files (DO NOT MODIFY)

- All business/restaurant dashboard pages
- `src/components/campaigns/ApplicationForm.tsx` (used elsewhere)
- `src/components/campaigns/CampaignDetailsPage.tsx`
- `src/components/campaigns/DeliveryBadge.tsx`
- Auth logic, Supabase config, Stripe integration
- Any existing desktop `lg:` Tailwind classes

---

## Task 1: Utility Functions

**Files:**
- Create: `src/lib/campaignUtils.ts`

- [ ] **Step 1: Create campaignUtils.ts with all utility functions**

```typescript
// src/lib/campaignUtils.ts

import type { DeliveryTier } from '@/types/campaignMedia';
import { TIER_LIMITS } from '@/types/campaignMedia';

/**
 * Maps raw DB delivery_type values to the type system DeliveryTier.
 * Returns null for unknown/null values (no badge should be rendered).
 */
export function mapDeliveryType(dbValue: string | null | undefined): DeliveryTier | null {
  switch (dbValue) {
    case 'dragonrush': return 'dragondash';
    case 'expedited': return 'express';
    case 'standard': return 'standard';
    default: return null;
  }
}

/**
 * Returns a human-readable relative time string.
 * e.g., "2h ago", "1d ago", "3d ago", "2w ago"
 */
export function getRelativeTime(dateString: string): string {
  const now = Date.now();
  const then = new Date(dateString).getTime();
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHrs = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  const diffWeeks = Math.floor(diffDays / 7);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHrs < 24) return `${diffHrs}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffWeeks < 4) return `${diffWeeks}w ago`;
  return new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Haversine distance in miles between two lat/lng pairs.
 * Returns null if any coordinate is missing.
 */
export function calculateDistance(
  lat1: number | null | undefined,
  lng1: number | null | undefined,
  lat2: number | null | undefined,
  lng2: number | null | undefined
): number | null {
  if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) return null;

  const R = 3958.8; // Earth radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10; // one decimal place
}

/**
 * Formats a campaign budget for display.
 */
export function formatBudget(campaign: {
  pricing_type?: string | null;
  fixed_price?: number | null;
  budget_min?: number | null;
  budget_max?: number | null;
}): string {
  if (campaign.pricing_type === 'fixed' && campaign.fixed_price) {
    return `$${campaign.fixed_price}`;
  }
  if (campaign.budget_min && campaign.budget_max) {
    return `$${campaign.budget_min} – $${campaign.budget_max}`;
  }
  if (campaign.budget_min) return `From $${campaign.budget_min}`;
  if (campaign.budget_max) return `Up to $${campaign.budget_max}`;
  return 'Budget TBD';
}

/**
 * Resolves cover image URL using the 4-step fallback chain:
 * 1. First reference_image from campaign_media
 * 2. AI preview image (if ai_preview_status = 'ready')
 * 3. Business logo URL (caller handles blur treatment)
 * 4. null (caller renders branded gradient)
 */
export function getCoverImageUrl(
  mediaItems: Array<{ media_type: string; file_url: string }> | undefined,
  aiPreviewStatus: string | null | undefined,
  businessLogoUrl: string | null | undefined
): { url: string | null; type: 'reference' | 'ai_preview' | 'logo' | 'gradient' } {
  // Step 1: reference image
  const refImage = mediaItems?.find(m => m.media_type === 'reference_image');
  if (refImage) return { url: refImage.file_url, type: 'reference' };

  // Step 2: AI preview
  const aiPreview = mediaItems?.find(m => m.media_type === 'ai_preview');
  if (aiPreview && aiPreviewStatus === 'ready') return { url: aiPreview.file_url, type: 'ai_preview' };

  // Step 3: business logo
  if (businessLogoUrl) return { url: businessLogoUrl, type: 'logo' };

  // Step 4: gradient fallback
  return { url: null, type: 'gradient' };
}

/**
 * Returns the tier config (fee, timeframe, label) for a delivery tier.
 * Uses TIER_LIMITS as the single source of truth.
 */
export function getTierConfig(tier: DeliveryTier | null) {
  if (!tier) return null;
  return TIER_LIMITS[tier];
}
```

- [ ] **Step 2: Verify the file compiles**

Run: `npx tsc --noEmit src/lib/campaignUtils.ts 2>&1 | head -20`
Expected: No errors (or only unrelated errors from other files). If tsc doesn't support single-file check, run `npm run build` instead.

- [ ] **Step 3: Commit**

```bash
git add src/lib/campaignUtils.ts
git commit -m "feat: add campaign utility functions (mapDeliveryType, getRelativeTime, etc.)"
```

---

## Task 2: Add ai_preview_status to Campaign Interface

**Files:**
- Modify: `src/hooks/useCampaignQueries.ts`

The `Campaign` interface does not include `ai_preview_status`, but the field exists in the DB and is returned by `select('*')`. We need it typed for the cover image fallback chain.

- [ ] **Step 1: Add the field to the Campaign interface**

In `src/hooks/useCampaignQueries.ts`, add to the `Campaign` interface (after the `ai_analysis` field):

```typescript
  ai_preview_status?: string | null;
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useCampaignQueries.ts
git commit -m "feat: add ai_preview_status to Campaign interface"
```

---

## Task 3: Enhance usePublicCampaigns Hook

**Files:**
- Modify: `src/hooks/usePublicCampaigns.ts`

The hook currently fetches campaigns + business profiles + application counts. We need to add:
- Cover image URL (first `campaign_media` reference_image or ai_preview)
- Deliverable count and content types (from `campaign_deliverables`)

- [ ] **Step 1: Update the PublicCampaign interface**

In `src/hooks/usePublicCampaigns.ts`, add these fields to the `PublicCampaign` interface (after line 17, before the closing `}`):

```typescript
  cover_image_url?: string;
  cover_image_type?: 'reference' | 'ai_preview' | 'logo' | 'gradient';
  deliverable_count?: number;
  content_types?: string[];
```

- [ ] **Step 2: Add media and deliverables queries to the enrichment loop**

After the business profile map is built (after line 110), add batch queries for campaign media and deliverables. Before the `enrichedCampaigns` Promise.all loop, add:

```typescript
      // Batch fetch cover images: first reference_image or ai_preview per campaign
      const campaignIds = visibleCampaigns.map(c => c.id);

      const { data: allMedia } = await supabase
        .from('campaign_media')
        .select('campaign_id, media_type, file_url')
        .in('campaign_id', campaignIds)
        .in('media_type', ['reference_image', 'ai_preview'])
        .order('sort_order', { ascending: true });

      // Build a map of campaign_id -> media items
      const mediaMap = new Map<string, Array<{ media_type: string; file_url: string }>>();
      for (const item of allMedia || []) {
        const list = mediaMap.get(item.campaign_id) || [];
        list.push(item);
        mediaMap.set(item.campaign_id, list);
      }

      // Batch fetch deliverable counts and content types
      const { data: allDeliverables } = await supabase
        .from('campaign_deliverables')
        .select('campaign_id, content_type')
        .in('campaign_id', campaignIds);

      // Build maps for deliverable data
      const deliverableCountMap = new Map<string, number>();
      const contentTypeMap = new Map<string, string[]>();
      for (const d of allDeliverables || []) {
        deliverableCountMap.set(d.campaign_id, (deliverableCountMap.get(d.campaign_id) || 0) + 1);
        const types = contentTypeMap.get(d.campaign_id) || [];
        if (!types.includes(d.content_type)) types.push(d.content_type);
        contentTypeMap.set(d.campaign_id, types);
      }
```

- [ ] **Step 3: Add the new fields to the enriched campaign object**

Inside the `enrichedCampaigns` Promise.all map callback, after `application_status`, add:

```typescript
            // Cover image from campaign media
            const campaignMedia = mediaMap.get(campaign.id);
            const coverImage = getCoverImageUrl(
              campaignMedia,
              campaign.ai_preview_status,
              businessProfile?.logo_url
            );

            // Deliverable data
            const deliverableCount = deliverableCountMap.get(campaign.id)
              || campaign.deliverables?.length
              || 0;
            const contentTypes = contentTypeMap.get(campaign.id)
              || [];
```

And spread these into the return object:

```typescript
            cover_image_url: coverImage.url ?? undefined,
            cover_image_type: coverImage.type,
            deliverable_count: deliverableCount,
            content_types: contentTypes,
```

- [ ] **Step 4: Add the import for getCoverImageUrl**

Add at the top of the file:

```typescript
import { getCoverImageUrl } from '@/lib/campaignUtils';
```

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/usePublicCampaigns.ts
git commit -m "feat: enrich public campaigns with cover image, deliverable count, content types"
```

---

## Task 4: Create useCampaignDetail Hook

**Files:**
- Create: `src/hooks/useCampaignDetail.ts`

This hook fetches the full campaign_media and campaign_deliverables for the detail modal.

- [ ] **Step 1: Create the hook**

```typescript
// src/hooks/useCampaignDetail.ts

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { CampaignMediaItem, CampaignDeliverable } from '@/types/campaignMedia';

export interface CampaignDetail {
  media: CampaignMediaItem[];
  deliverables: CampaignDeliverable[];
  hasRawFootage: boolean;
  referenceMedia: CampaignMediaItem[];
}

export const useCampaignDetail = (campaignId: string | null) => {
  return useQuery({
    queryKey: ['campaign-detail', campaignId],
    queryFn: async (): Promise<CampaignDetail> => {
      if (!campaignId) throw new Error('No campaign ID');

      const [mediaResult, deliverablesResult] = await Promise.all([
        supabase
          .from('campaign_media')
          .select('id, campaign_id, uploaded_by, media_type, file_url, file_name, file_size_bytes, mime_type, duration_seconds, thumbnail_url, sort_order, ai_analysis, created_at, updated_at')
          .eq('campaign_id', campaignId)
          .order('sort_order', { ascending: true }),
        supabase
          .from('campaign_deliverables')
          .select('id, campaign_id, content_type, platform, description, aspect_ratio, max_duration_seconds, status, sort_order, created_at, updated_at')
          .eq('campaign_id', campaignId)
          .order('sort_order', { ascending: true }),
      ]);

      if (mediaResult.error) throw mediaResult.error;
      if (deliverablesResult.error) throw deliverablesResult.error;

      const media = (mediaResult.data || []) as CampaignMediaItem[];
      const deliverables = (deliverablesResult.data || []) as CampaignDeliverable[];

      return {
        media,
        deliverables,
        hasRawFootage: media.some(m => m.media_type === 'raw_footage'),
        referenceMedia: media.filter(m =>
          m.media_type === 'reference_image' || m.media_type === 'reference_video'
        ),
      };
    },
    enabled: !!campaignId,
  });
};
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useCampaignDetail.ts
git commit -m "feat: add useCampaignDetail hook for campaign media and deliverables"
```

---

## Task 5: Create useCreatorApplications Hook

**Files:**
- Create: `src/hooks/useCreatorApplications.ts`

Two-step query following the same pattern as `usePublicCampaigns`: fetch applications with campaign join, then fetch business profiles separately and merge in-memory.

- [ ] **Step 1: Create the hook**

```typescript
// src/hooks/useCreatorApplications.ts

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface ApplicationCampaign {
  id: string;
  title: string;
  user_id: string;
  description: string | null;
  goals: string | null;
  style: string | null;
  tone: string | null;
  delivery_type: string | null;
  pricing_type: string | null;
  fixed_price: number | null;
  budget_min: number | null;
  budget_max: number | null;
  deliverables: string[] | null;
}

interface ApplicationBusinessProfile {
  business_name: string;
  logo_url: string | null;
  city: string | null;
  country: string | null;
}

export interface CreatorApplication {
  id: string;
  campaign_id: string;
  creator_id: string;
  intro_message: string | null;
  proposed_timeline: string | null;
  proposed_rate: number | null;
  status: 'pending' | 'accepted' | 'rejected' | 'counter_offered';
  created_at: string;
  updated_at: string;
  campaign?: ApplicationCampaign;
  business_profile?: ApplicationBusinessProfile;
}

export const useCreatorApplications = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['creator-applications', user?.id],
    queryFn: async (): Promise<CreatorApplication[]> => {
      if (!user?.id) throw new Error('Not authenticated');

      // Step 1: Fetch applications with campaign data
      const { data: applications, error: appError } = await supabase
        .from('campaign_applications')
        .select(`
          id, campaign_id, creator_id, intro_message, proposed_timeline,
          proposed_rate, status, created_at, updated_at,
          campaign:campaigns!inner(id, title, user_id, description, goals, style, tone, delivery_type, pricing_type, fixed_price, budget_min, budget_max, deliverables)
        `)
        .eq('creator_id', user.id)
        .order('created_at', { ascending: false });

      if (appError) throw appError;
      if (!applications || applications.length === 0) return [];

      // Step 2: Fetch business profiles for campaign owners
      const campaignUserIds = [...new Set(
        applications
          .map(a => (a.campaign as unknown as ApplicationCampaign)?.user_id)
          .filter(Boolean)
      )];

      const { data: businessProfiles, error: profileError } = await supabase
        .from('business_profiles')
        .select('user_id, business_name, logo_url, city, country')
        .in('user_id', campaignUserIds);

      if (profileError) throw profileError;

      // Build lookup map
      const profileMap = new Map(
        (businessProfiles || []).map(p => [p.user_id, p])
      );

      // Step 3: Merge
      return applications.map(app => {
        const campaign = app.campaign as unknown as ApplicationCampaign;
        const businessProfile = campaign ? profileMap.get(campaign.user_id) : undefined;

        return {
          id: app.id,
          campaign_id: app.campaign_id,
          creator_id: app.creator_id,
          intro_message: app.intro_message,
          proposed_timeline: app.proposed_timeline,
          proposed_rate: app.proposed_rate,
          status: app.status as CreatorApplication['status'],
          created_at: app.created_at,
          updated_at: app.updated_at,
          campaign,
          business_profile: businessProfile ? {
            business_name: businessProfile.business_name,
            logo_url: businessProfile.logo_url,
            city: businessProfile.city,
            country: businessProfile.country,
          } : undefined,
        };
      });
    },
    enabled: !!user?.id,
  });
};
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useCreatorApplications.ts
git commit -m "feat: add useCreatorApplications hook for Applied tab"
```

---

## Task 6: Rebuild CampaignSwipeCard

**Files:**
- Modify: `src/components/campaigns/CampaignSwipeCard.tsx`

This is the biggest visual change. Rebuild `CardContent` to show real campaign data. Change swipe-right from triggering apply to opening the detail modal. Add tap handler for opening modal.

- [ ] **Step 1: Update imports and interface**

Replace the imports section (lines 1-8) with:

```typescript
import React, { useState, useRef } from 'react';
import TinderCard from 'react-tinder-card';
import { PublicCampaign } from '@/hooks/usePublicCampaigns';
import { MapPin, Users } from 'lucide-react';
import logo from '@/assets/Transparent_DragonCandy_logo.png';
import DeliveryBadge from './DeliveryBadge';
import { mapDeliveryType, getRelativeTime, formatBudget } from '@/lib/campaignUtils';
```

Update the `CampaignSwipeCardProps` interface to add an `onViewDetail` callback:

```typescript
interface CampaignSwipeCardProps {
  campaigns: PublicCampaign[];
  onSwipe: (direction: string, campaign: PublicCampaign) => void;
  onViewDetail: (campaign: PublicCampaign) => void;
}
```

- [ ] **Step 2: Update the component to use onViewDetail**

In the component function signature, destructure `onViewDetail` instead of `onApply`. Update the `CardContent` usage to pass `onViewDetail`:

```typescript
<CardContent campaign={campaign} onViewDetail={onViewDetail} />
```

Update `CardContentProps`:

```typescript
interface CardContentProps {
  campaign: PublicCampaign;
  onViewDetail: (campaign: PublicCampaign) => void;
}
```

- [ ] **Step 3: Rebuild CardContent**

Replace the entire `CardContent` component (lines 111-209) with the new implementation. Key changes:

- Cover image: use `campaign.cover_image_url` and `campaign.cover_image_type` for the 4-step fallback
- Title: use `campaign.title` (already correct, but remove fallback to wizard text)
- Budget: large teal text with `formatBudget()`
- Delivery badge: use `mapDeliveryType()` instead of raw cast — fixes the existing bug
- Content type pills: render from `campaign.content_types`
- Applicant count badge: top-left overlay from `campaign.application_count`
- Posted time: from `getRelativeTime(campaign.created_at)`
- Location: from business_profile city/country
- CTA: "View Campaign" (teal) instead of "Apply Now" (pink)
- Card body click: calls `onViewDetail(campaign)`

```typescript
const CardContent: React.FC<CardContentProps> = ({ campaign, onViewDetail }) => {
  const businessName = campaign.business_profile?.business_name ?? 'Unknown Business';
  const businessLogo = campaign.business_profile?.logo_url;
  const location = campaign.business_profile?.city
    ? `${campaign.business_profile.city}${campaign.business_profile.country ? ', ' + campaign.business_profile.country : ''}`
    : campaign.business_profile?.location ?? null;
  const deliveryTier = mapDeliveryType(campaign.delivery_type);
  const applicantCount = campaign.application_count ?? 0;
  const postedTime = getRelativeTime(campaign.created_at);
  const deliverableCount = campaign.deliverable_count ?? campaign.deliverables?.length ?? 0;
  const contentTypes = campaign.content_types ?? [];

  // Cover image fallback rendering
  const renderCoverImage = () => {
    if (campaign.cover_image_url && campaign.cover_image_type === 'reference') {
      return (
        <img
          src={campaign.cover_image_url}
          alt={campaign.title}
          className="w-full h-full object-cover"
          draggable={false}
        />
      );
    }
    if (campaign.cover_image_url && campaign.cover_image_type === 'ai_preview') {
      return (
        <img
          src={campaign.cover_image_url}
          alt={campaign.title}
          className="w-full h-full object-cover"
          draggable={false}
        />
      );
    }
    if (campaign.cover_image_url && campaign.cover_image_type === 'logo') {
      // Blurred logo treatment
      return (
        <div className="w-full h-full relative overflow-hidden">
          <img
            src={campaign.cover_image_url}
            alt=""
            className="w-full h-full object-cover scale-150 blur-2xl opacity-60"
            draggable={false}
          />
          <img
            src={campaign.cover_image_url}
            alt={businessName}
            className="absolute inset-0 m-auto w-20 h-20 object-contain rounded-full"
            draggable={false}
          />
        </div>
      );
    }
    // Branded gradient fallback
    return (
      <div className="w-full h-full bg-gradient-to-br from-dc-teal via-dc-pink/40 to-dc-teal-dark flex items-center justify-center">
        <div className="text-center px-4">
          <img src={logo} alt="Dragon Candy" className="w-16 h-16 mx-auto mb-2 opacity-70" draggable={false} />
          <p className="text-white/80 font-bold text-sm line-clamp-2">{campaign.title}</p>
        </div>
      </div>
    );
  };

  const contentTypeLabels: Record<string, string> = {
    photo: 'Photo',
    video_reel: 'Reel',
    story: 'Story',
    carousel: 'Carousel',
    tiktok: 'TikTok',
    youtube_short: 'YT Short',
  };

  return (
    <div
      className="bg-white rounded-2xl shadow-xl overflow-hidden h-full flex flex-col cursor-grab active:cursor-grabbing"
      onClick={(e) => {
        e.stopPropagation();
        onViewDetail(campaign);
      }}
    >
      {/* Hero image area — 60% height */}
      <div className="relative" style={{ height: '60%', flexShrink: 0 }}>
        {renderCoverImage()}

        {/* Dark overlay gradient at bottom of image */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

        {/* Delivery badge — top-right */}
        {deliveryTier && (
          <div className="absolute top-3 right-3 z-10">
            <DeliveryBadge deliveryType={deliveryTier} size="sm" showTimeframe={false} />
          </div>
        )}

        {/* Applicant count — top-left */}
        {applicantCount > 0 && (
          <div className="absolute top-3 left-3 z-10 flex items-center gap-1 bg-black/50 rounded-full px-2.5 py-1">
            <Users className="w-3 h-3 text-white" />
            <span className="text-white text-xs font-medium">{applicantCount} applied</span>
          </div>
        )}

        {/* Title + location overlay */}
        <div className="absolute bottom-0 left-0 right-0 p-4 z-10">
          <p className="text-white font-bold text-lg leading-tight drop-shadow-sm line-clamp-2">
            {campaign.title}
          </p>
          <div className="flex items-center gap-2 mt-1.5 text-white/75 text-xs">
            {location && (
              <span className="flex items-center gap-1">
                <MapPin className="w-3 h-3 text-dc-pink flex-shrink-0" />
                {location}
              </span>
            )}
            {location && <span className="opacity-50">·</span>}
            <span>{postedTime}</span>
          </div>
        </div>
      </div>

      {/* Card body */}
      <div className="flex flex-col flex-1 px-4 py-3 min-h-0">
        {/* Budget + deliverable count */}
        <div className="flex items-center justify-between flex-shrink-0">
          <span className="text-dc-teal font-bold text-base">{formatBudget(campaign)}</span>
          {deliverableCount > 0 && (
            <span className="text-gray-500 text-xs">{deliverableCount} deliverable{deliverableCount !== 1 ? 's' : ''}</span>
          )}
        </div>

        {/* Content type pills */}
        {contentTypes.length > 0 && (
          <div className="flex gap-1.5 mt-2 flex-wrap flex-shrink-0">
            {contentTypes.slice(0, 4).map((type) => (
              <span
                key={type}
                className="bg-teal-50 text-teal-700 text-[10px] px-2 py-0.5 rounded-full border border-teal-200"
              >
                {contentTypeLabels[type] ?? type}
              </span>
            ))}
          </div>
        )}

        {/* Business row */}
        <div className="flex items-center gap-2 mt-2 flex-shrink-0">
          <div className="w-7 h-7 rounded-full ring-2 ring-dc-teal overflow-hidden flex-shrink-0 bg-dc-pink-bg flex items-center justify-center">
            {businessLogo ? (
              <img src={businessLogo} alt={businessName} className="w-full h-full object-cover" />
            ) : (
              <span className="text-xs font-bold text-dc-teal-dark">
                {businessName.charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          <span className="text-sm font-semibold text-gray-700 truncate">{businessName}</span>
          <span className="text-dc-teal text-xs">✓</span>
        </div>

        {/* View Campaign CTA */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onViewDetail(campaign);
          }}
          className="w-full bg-dc-teal text-white rounded-full h-11 font-bold mt-auto flex-shrink-0 hover:bg-dc-teal-dark transition-colors duration-150 active:scale-95 text-sm"
        >
          View Campaign
        </button>
      </div>
    </div>
  );
};
```

- [ ] **Step 4: Verify no unused imports remain**

The Step 1 import replacement already removed `DollarSign` and the `DeliveryType`/`DeliveryTypeSelector` import. Verify no other unused imports are present.

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: Build succeeds. You may see warnings about unused `onApply` prop in the marketplace page — that will be fixed in Task 8.

- [ ] **Step 6: Commit**

```bash
git add src/components/campaigns/CampaignSwipeCard.tsx
git commit -m "feat: rebuild campaign swipe card with rich data and cover image fallback"
```

---

## Task 8: Create CampaignDetailModal

> **⚠️ EXECUTION ORDER:** Complete Task 7 (CampaignApplyForm) BEFORE this task. Task 7 appears later in this document but must be implemented first because this component imports CampaignApplyForm.

**Files:**
- Create: `src/components/campaigns/CampaignDetailModal.tsx`

Full-screen scrollable modal with all campaign details. Conditionally renders sections based on available data.

- [ ] **Step 1: Create the modal component**

Create `src/components/campaigns/CampaignDetailModal.tsx`. This is a large component — here is the structure:

```typescript
// src/components/campaigns/CampaignDetailModal.tsx

import React, { useState, useRef, useEffect } from 'react';
import { X, MapPin, Users, Clock, Package, ChevronRight } from 'lucide-react';
import { PublicCampaign } from '@/hooks/usePublicCampaigns';
import { useCampaignDetail } from '@/hooks/useCampaignDetail';
import DeliveryBadge from './DeliveryBadge';
import CampaignApplyForm from './CampaignApplyForm';
import { mapDeliveryType, getRelativeTime, formatBudget, getTierConfig } from '@/lib/campaignUtils';
import type { DeliveryTier, ContentType } from '@/types/campaignMedia';

interface CampaignDetailModalProps {
  campaign: PublicCampaign;
  isOpen: boolean;
  onClose: () => void;
  onApplicationSubmitted: () => void;
  /** If true, shows in read-only mode (no apply button) — used from Applied tab */
  readOnly?: boolean;
}

export const CampaignDetailModal: React.FC<CampaignDetailModalProps> = ({
  campaign,
  isOpen,
  onClose,
  onApplicationSubmitted,
  readOnly = false,
}) => {
  const [showApplyForm, setShowApplyForm] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const { data: detail, isLoading: detailLoading } = useCampaignDetail(isOpen ? campaign.id : null);

  const deliveryTier = mapDeliveryType(campaign.delivery_type);
  const tierConfig = getTierConfig(deliveryTier);
  const businessName = campaign.business_profile?.business_name ?? 'Unknown Business';
  const businessLogo = campaign.business_profile?.logo_url;
  const location = campaign.business_profile?.city
    ? `${campaign.business_profile.city}${campaign.business_profile.country ? ', ' + campaign.business_profile.country : ''}`
    : null;

  // Scroll to apply form when it opens
  useEffect(() => {
    if (showApplyForm && formRef.current) {
      formRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [showApplyForm]);

  if (!isOpen) return null;

  // Use detail data for deliverables, fall back to campaign.deliverables array
  const deliverables = detail?.deliverables ?? [];
  const fallbackDeliverables = campaign.deliverables ?? [];
  const referenceMedia = detail?.referenceMedia ?? [];
  const hasRawFootage = detail?.hasRawFootage ?? false;

  const contentTypeLabels: Record<string, string> = {
    photo: '📸 Photo',
    video_reel: '🎬 Reel',
    story: '📱 Story',
    carousel: '🖼 Carousel',
    tiktok: '🎵 TikTok',
    youtube_short: '▶️ YT Short',
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40 lg:block"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-end lg:items-center lg:justify-center">
        <div className="w-full h-full lg:h-auto lg:max-h-[90vh] lg:max-w-lg bg-white lg:rounded-2xl overflow-hidden flex flex-col">
          {/* Sticky header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-shrink-0">
            <button onClick={onClose} className="p-1 -ml-1 hover:bg-gray-100 rounded-full transition-colors">
              <X className="w-5 h-5 text-gray-500" />
            </button>
            <span className="font-semibold text-gray-800 text-sm">Campaign Details</span>
            <div className="w-7" /> {/* Spacer for centering */}
          </div>

          {/* Scrollable content */}
          <div ref={scrollContainerRef} className="flex-1 overflow-y-auto">
            {/* Hero image */}
            <div className="relative h-48 bg-gradient-to-br from-dc-teal via-dc-pink/40 to-dc-teal-dark">
              {campaign.cover_image_url && campaign.cover_image_type !== 'gradient' && (
                <img
                  src={campaign.cover_image_url}
                  alt={campaign.title}
                  className={`w-full h-full object-cover ${campaign.cover_image_type === 'logo' ? 'scale-150 blur-2xl opacity-60' : ''}`}
                />
              )}
              {deliveryTier && (
                <div className="absolute top-3 right-3">
                  <DeliveryBadge deliveryType={deliveryTier} size="sm" showTimeframe={false} />
                </div>
              )}
            </div>

            {/* Title + business block */}
            <div className="px-4 py-4 border-b border-gray-100">
              <h2 className="text-xl font-bold text-gray-900 leading-tight">{campaign.title}</h2>
              <div className="flex items-center gap-2 mt-2">
                <div className="w-8 h-8 rounded-full ring-2 ring-dc-teal overflow-hidden flex-shrink-0 bg-dc-pink-bg flex items-center justify-center">
                  {businessLogo ? (
                    <img src={businessLogo} alt={businessName} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-xs font-bold text-dc-teal-dark">{businessName.charAt(0).toUpperCase()}</span>
                  )}
                </div>
                <div>
                  <div className="text-sm font-semibold text-gray-700">{businessName} <span className="text-dc-teal">✓</span></div>
                  {location && <div className="text-xs text-gray-500">{location}</div>}
                </div>
              </div>

              {/* Metrics pills */}
              <div className="flex gap-2 mt-3 flex-wrap">
                <span className="bg-teal-50 text-teal-700 text-xs px-2.5 py-1 rounded-full border border-teal-200 font-semibold">
                  💰 {formatBudget(campaign)}
                </span>
                {(deliverables.length > 0 || fallbackDeliverables.length > 0) && (
                  <span className="bg-gray-100 text-gray-600 text-xs px-2.5 py-1 rounded-full border border-gray-200">
                    📦 {deliverables.length || fallbackDeliverables.length} deliverable{(deliverables.length || fallbackDeliverables.length) !== 1 ? 's' : ''}
                  </span>
                )}
                {(campaign.application_count ?? 0) > 0 && (
                  <span className="bg-gray-100 text-gray-600 text-xs px-2.5 py-1 rounded-full border border-gray-200">
                    👥 {campaign.application_count} applied
                  </span>
                )}
                <span className="bg-gray-100 text-gray-600 text-xs px-2.5 py-1 rounded-full border border-gray-200">
                  🕐 {getRelativeTime(campaign.created_at)}
                </span>
              </div>
            </div>

            {/* About This Campaign */}
            {(campaign.description || campaign.goals) && (
              <div className="px-4 py-4 border-b border-gray-100">
                <h3 className="text-sm font-bold text-gray-900 mb-2">About This Campaign</h3>
                {campaign.description && (
                  <p className="text-sm text-gray-600 leading-relaxed">{campaign.description}</p>
                )}
                {campaign.goals && (
                  <>
                    <h4 className="text-sm font-semibold text-gray-800 mt-3 mb-1">Goals</h4>
                    <p className="text-sm text-gray-600 leading-relaxed">{campaign.goals}</p>
                  </>
                )}
              </div>
            )}

            {/* Visual References */}
            {referenceMedia.length > 0 && (
              <div className="px-4 py-4 border-b border-gray-100">
                <h3 className="text-sm font-bold text-gray-900 mb-2">Visual References</h3>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {referenceMedia.map((item) => (
                    <div key={item.id} className="flex-shrink-0 w-24 h-24 rounded-xl overflow-hidden border border-gray-200">
                      <img
                        src={item.thumbnail_url || item.file_url}
                        alt={item.file_name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Raw Footage Available */}
            {hasRawFootage && (
              <div className="px-4 py-4 border-b border-gray-100">
                <div className="bg-teal-50 border border-teal-200 rounded-xl p-3 flex items-center gap-3">
                  <span className="text-xl">📹</span>
                  <div>
                    <div className="text-sm font-semibold text-teal-700">Raw Footage Provided</div>
                    <div className="text-xs text-gray-600 mt-0.5">The business has footage for you to use. Available after acceptance.</div>
                  </div>
                </div>
              </div>
            )}

            {/* Deliverables Breakdown */}
            {(deliverables.length > 0 || fallbackDeliverables.length > 0) && (
              <div className="px-4 py-4 border-b border-gray-100">
                <h3 className="text-sm font-bold text-gray-900 mb-3">Deliverables</h3>
                <div className="space-y-3">
                  {deliverables.length > 0
                    ? deliverables.map((d, i) => (
                        <div key={d.id} className="flex gap-3 items-start">
                          <div className="w-6 h-6 rounded-full bg-dc-teal text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
                            {i + 1}
                          </div>
                          <div>
                            <div className="text-sm font-semibold text-gray-800">
                              {contentTypeLabels[d.content_type] ?? d.content_type}
                              {d.description ? ` — ${d.description}` : ''}
                            </div>
                            <div className="text-xs text-gray-500 mt-0.5">
                              {d.platform} · {d.aspect_ratio}
                              {d.max_duration_seconds ? ` · max ${d.max_duration_seconds}s` : ''}
                            </div>
                          </div>
                        </div>
                      ))
                    : fallbackDeliverables.map((d, i) => (
                        <div key={i} className="flex gap-3 items-start">
                          <div className="w-6 h-6 rounded-full bg-dc-teal text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
                            {i + 1}
                          </div>
                          <div className="text-sm text-gray-800">{d}</div>
                        </div>
                      ))
                  }
                </div>
              </div>
            )}

            {/* Timeline */}
            {tierConfig && deliveryTier && (
              <div className="px-4 py-4 border-b border-gray-100">
                <h3 className="text-sm font-bold text-gray-900 mb-2">Timeline</h3>
                <div className={`rounded-xl p-3 ${
                  deliveryTier === 'dragondash' ? 'bg-orange-50 border border-orange-200' :
                  deliveryTier === 'express' ? 'bg-yellow-50 border border-yellow-200' :
                  'bg-green-50 border border-green-200'
                }`}>
                  <div className="flex items-center gap-2 mb-1">
                    <DeliveryBadge deliveryType={deliveryTier} size="sm" showTimeframe={false} />
                  </div>
                  <div className="text-sm text-gray-700">
                    Due <strong>{tierConfig.timeframe}</strong> from acceptance
                  </div>
                  {tierConfig.fee > 0 && (
                    <div className="text-xs text-gray-500 mt-1">
                      Includes ${tierConfig.fee} rush delivery fee
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Budget */}
            <div className="px-4 py-4 border-b border-gray-100">
              <h3 className="text-sm font-bold text-gray-900 mb-2">Budget</h3>
              <div className="text-2xl font-bold text-dc-teal">{formatBudget(campaign)}</div>
              <div className="text-xs text-gray-500 mt-1">
                {campaign.pricing_type === 'fixed'
                  ? 'Fixed price'
                  : 'Bid range · You\'ll propose your rate when applying'
                }
              </div>
              <div className="text-xs text-gray-500 mt-0.5">Payment via Stripe upon approval</div>
            </div>

            {/* About the Business */}
            <div className="px-4 py-4 border-b border-gray-100">
              <h3 className="text-sm font-bold text-gray-900 mb-2">About the Business</h3>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full ring-2 ring-dc-teal overflow-hidden flex-shrink-0 bg-dc-pink-bg flex items-center justify-center">
                  {businessLogo ? (
                    <img src={businessLogo} alt={businessName} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-sm font-bold text-dc-teal-dark">{businessName.charAt(0).toUpperCase()}</span>
                  )}
                </div>
                <div>
                  <div className="text-sm font-semibold text-gray-700">{businessName} <span className="text-dc-teal">✓</span></div>
                  {location && <div className="text-xs text-gray-500">{location}</div>}
                </div>
              </div>
            </div>

            {/* Requirements */}
            {(campaign.style || campaign.tone) && (
              <div className="px-4 py-4 border-b border-gray-100">
                <h3 className="text-sm font-bold text-gray-900 mb-2">Requirements</h3>
                <div className="text-sm text-gray-600 leading-relaxed">
                  {campaign.style && <span>Style: <strong className="text-gray-800 capitalize">{campaign.style}</strong>. </span>}
                  {campaign.tone && <span>Tone: <strong className="text-gray-800 capitalize">{campaign.tone}</strong>.</span>}
                </div>
              </div>
            )}

            {/* Inline Apply Form */}
            {showApplyForm && !readOnly && (
              <div ref={formRef}>
                <CampaignApplyForm
                  campaign={campaign}
                  deliveryTier={deliveryTier}
                  onSuccess={onApplicationSubmitted}
                  onCancel={() => setShowApplyForm(false)}
                />
              </div>
            )}

            {/* Spacer for sticky button */}
            {!showApplyForm && !readOnly && <div className="h-20" />}
          </div>

          {/* Sticky Apply Button */}
          {!showApplyForm && !readOnly && (
            <div className="flex-shrink-0 px-4 py-3 border-t border-gray-100 bg-white shadow-[0_-4px_12px_rgba(0,0,0,0.05)]">
              <button
                onClick={() => setShowApplyForm(true)}
                className="w-full bg-dc-teal text-white rounded-full py-3.5 font-bold text-sm hover:bg-dc-teal-dark transition-colors active:scale-95"
              >
                Apply for This Campaign
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default CampaignDetailModal;
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds. `CampaignApplyForm` was created in Task 7 (prior task).

- [ ] **Step 3: Commit**

```bash
git add src/components/campaigns/CampaignDetailModal.tsx
git commit -m "feat: add CampaignDetailModal with full campaign brief and media gallery"
```

---

## Task 7: Create CampaignApplyForm

**Files:**
- Create: `src/components/campaigns/CampaignApplyForm.tsx`

Inline application form with rate input, date pills, quick pitch, and DragonDash urgency warning. Maps to existing `useCreateApplication` mutation. **Must be completed before Task 8 (CampaignDetailModal imports this).**

- [ ] **Step 1: Create the form component**

```typescript
// src/components/campaigns/CampaignApplyForm.tsx

import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { PublicCampaign } from '@/hooks/usePublicCampaigns';
import { useCreateApplication } from '@/hooks/useCreateApplication';
import { formatBudget } from '@/lib/campaignUtils';
import type { DeliveryTier } from '@/types/campaignMedia';
import { TIER_LIMITS } from '@/types/campaignMedia';

interface CampaignApplyFormProps {
  campaign: PublicCampaign;
  deliveryTier: DeliveryTier | null;
  onSuccess: () => void;
  onCancel: () => void;
}

type DateOption = 'today' | 'tomorrow' | 'this_week' | 'custom';

function getISODate(option: DateOption): string {
  const now = new Date();
  switch (option) {
    case 'today':
      return now.toISOString().split('T')[0];
    case 'tomorrow': {
      const d = new Date(now);
      d.setDate(d.getDate() + 1);
      return d.toISOString().split('T')[0];
    }
    case 'this_week': {
      const d = new Date(now);
      const dayOfWeek = d.getDay();
      const daysUntilSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
      d.setDate(d.getDate() + daysUntilSunday);
      return d.toISOString().split('T')[0];
    }
    default:
      return now.toISOString().split('T')[0];
  }
}

const CampaignApplyForm: React.FC<CampaignApplyFormProps> = ({
  campaign,
  deliveryTier,
  onSuccess,
  onCancel,
}) => {
  const isDragonDash = deliveryTier === 'dragondash';
  const isFixedPrice = campaign.pricing_type === 'fixed';

  const [proposedRate, setProposedRate] = useState('');
  const [selectedDate, setSelectedDate] = useState<DateOption>('today');
  const [pitch, setPitch] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const createApplication = useCreateApplication();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFixedPrice && !proposedRate) return;

    try {
      await createApplication.mutateAsync({
        campaignId: campaign.id,
        introMessage: pitch || '',
        proposedTimeline: getISODate(selectedDate),
        proposedRate: isFixedPrice ? undefined : Number(proposedRate),
      });
      setSubmitted(true);
      // Small delay so user sees success state before modal closes
      setTimeout(() => onSuccess(), 1500);
    } catch {
      // Error handled by mutation's onError
    }
  };

  if (submitted) {
    return (
      <div className="px-4 py-8 text-center border-t-[3px] border-dc-teal">
        <div className="text-2xl mb-2">✅</div>
        <h3 className="text-lg font-bold text-gray-900 mb-1">Application Sent!</h3>
        <p className="text-sm text-gray-500">The business will respond within 24 hours.</p>
      </div>
    );
  }

  const dateOptions: { value: DateOption; label: string }[] = [
    { value: 'today', label: 'Today' },
    { value: 'tomorrow', label: 'Tomorrow' },
    { value: 'this_week', label: 'This Week' },
  ];

  return (
    <form onSubmit={handleSubmit} className="px-4 py-4 border-t-[3px] border-dc-teal">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-bold text-gray-900">Apply for This Campaign</h3>
        <button type="button" onClick={onCancel} className="text-xs text-gray-500 hover:text-gray-700">
          Cancel
        </button>
      </div>

      {/* Proposed Rate (bid-range only) */}
      {isFixedPrice ? (
        <div className="bg-green-50 border border-green-200 rounded-xl p-3 mb-4">
          <p className="text-sm text-green-800">
            Fixed-price campaign. You will receive <strong>{formatBudget(campaign)}</strong> upon successful completion.
          </p>
        </div>
      ) : (
        <div className="mb-4">
          <label className="text-xs font-semibold text-gray-700 block mb-1.5">💰 Your Rate</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-dc-teal font-bold text-sm">$</span>
            <input
              type="number"
              value={proposedRate}
              onChange={(e) => setProposedRate(e.target.value)}
              className="w-full pl-7 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-800 outline-none focus:border-dc-teal focus:ring-1 focus:ring-dc-teal"
              placeholder="Enter your rate"
              min="0"
              step="1"
              required
            />
          </div>
          <p className="text-[11px] text-gray-500 mt-1">
            Campaign range: {formatBudget(campaign)}
          </p>
        </div>
      )}

      {/* Available Dates */}
      <div className="mb-4">
        <label className="text-xs font-semibold text-gray-700 block mb-1.5">📅 Available Dates</label>
        <div className="flex gap-1.5 flex-wrap">
          {dateOptions.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setSelectedDate(opt.value)}
              className={`text-xs px-3 py-1.5 rounded-full font-semibold transition-colors ${
                selectedDate === opt.value
                  ? 'bg-teal-50 text-teal-700 border-2 border-dc-teal'
                  : 'bg-white text-gray-600 border border-gray-200 hover:border-gray-300'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {isDragonDash && (
          <p className="text-[11px] text-orange-700 mt-1.5">
            ⚡ DragonDash — must deliver within {TIER_LIMITS.dragondash.timeframe} of acceptance
          </p>
        )}
      </div>

      {/* Quick Pitch */}
      <div className="mb-4">
        <label className="text-xs font-semibold text-gray-700 block mb-1.5">
          ✍️ Quick Pitch <span className="font-normal text-gray-400">(optional)</span>
        </label>
        <textarea
          value={pitch}
          onChange={(e) => setPitch(e.target.value.slice(0, 280))}
          placeholder="Why you're a great fit for this campaign..."
          className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-800 outline-none focus:border-dc-teal focus:ring-1 focus:ring-dc-teal resize-none h-[72px]"
          maxLength={280}
        />
        <p className="text-[11px] text-gray-400 mt-0.5">
          {pitch.length}/280 · Keep it short — 1-2 sentences is perfect
        </p>
      </div>

      {/* DragonDash urgency warning */}
      {isDragonDash && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 mb-4 flex items-center gap-2">
          <span className="text-base">⚡</span>
          <p className="text-xs text-orange-800 leading-snug">
            <strong>DragonDash campaign.</strong> If accepted, you'll need to deliver within {TIER_LIMITS.dragondash.timeframe}.
          </p>
        </div>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={createApplication.isPending || (!isFixedPrice && !proposedRate)}
        className="w-full bg-dc-teal text-white rounded-full py-3.5 font-bold text-sm hover:bg-dc-teal-dark transition-colors active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {createApplication.isPending ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Submitting...
          </>
        ) : (
          'Submit Application'
        )}
      </button>
      <p className="text-[11px] text-gray-400 text-center mt-2">
        The business will respond within 24 hours
      </p>
    </form>
  );
};

export default CampaignApplyForm;
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/campaigns/CampaignApplyForm.tsx
git commit -m "feat: add inline CampaignApplyForm with date pills and DragonDash urgency"
```

---

## Task 9: Create CreatorApplicationCard

**Files:**
- Create: `src/components/campaigns/CreatorApplicationCard.tsx`

Card component for the Applied tab showing application status, campaign info, and action CTA.

- [ ] **Step 1: Create the component**

```typescript
// src/components/campaigns/CreatorApplicationCard.tsx

import React from 'react';
import { CreatorApplication } from '@/hooks/useCreatorApplications';
import { mapDeliveryType, formatBudget, getRelativeTime } from '@/lib/campaignUtils';

interface CreatorApplicationCardProps {
  application: CreatorApplication;
  onViewDetails: (application: CreatorApplication) => void;
  onViewCounterOffer?: (application: CreatorApplication) => void;
}

const statusConfig = {
  pending: {
    label: '⏳ Pending',
    badgeClass: 'bg-yellow-50 text-yellow-800 border-yellow-200',
    borderClass: '',
    opacity: '',
  },
  accepted: {
    label: '✅ Accepted',
    badgeClass: 'bg-teal-50 text-teal-800 border-teal-200',
    borderClass: 'border-l-[3px] border-l-dc-teal',
    opacity: '',
  },
  rejected: {
    label: '✗ Declined',
    badgeClass: 'bg-red-50 text-red-800 border-red-200',
    borderClass: '',
    opacity: 'opacity-70',
  },
  counter_offered: {
    label: '💬 Counter Offer',
    badgeClass: 'bg-orange-50 text-orange-800 border-orange-200',
    borderClass: 'border-l-[3px] border-l-orange-400',
    opacity: '',
  },
};

export const CreatorApplicationCard: React.FC<CreatorApplicationCardProps> = ({
  application,
  onViewDetails,
  onViewCounterOffer,
}) => {
  const config = statusConfig[application.status] ?? statusConfig.pending;
  const campaign = application.campaign;
  const businessName = application.business_profile?.business_name ?? 'Unknown Business';
  const businessLogo = application.business_profile?.logo_url;
  const appliedTime = getRelativeTime(application.created_at);

  const rateDisplay = campaign?.pricing_type === 'fixed' && campaign.fixed_price
    ? `$${campaign.fixed_price} fixed`
    : application.proposed_rate
      ? `Your bid: $${application.proposed_rate}`
      : 'Rate not specified';

  const handleAction = () => {
    if (application.status === 'counter_offered' && onViewCounterOffer) {
      onViewCounterOffer(application);
    } else {
      onViewDetails(application);
    }
  };

  const actionLabel = {
    pending: 'View Details',
    accepted: 'Start Campaign →',
    rejected: 'View Details',
    counter_offered: 'View Offer',
  }[application.status];

  const actionClass = application.status === 'accepted'
    ? 'bg-dc-teal text-white border-dc-teal font-semibold'
    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300';

  return (
    <div className={`bg-white rounded-2xl p-4 shadow-sm ${config.borderClass} ${config.opacity}`}>
      <div className="flex items-center gap-3 mb-3">
        {/* Business avatar */}
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-dc-teal/20 to-dc-pink/20 flex items-center justify-center flex-shrink-0 overflow-hidden">
          {businessLogo ? (
            <img src={businessLogo} alt={businessName} className="w-full h-full object-cover" />
          ) : (
            <span className="text-sm font-bold text-dc-teal-dark">
              {businessName.charAt(0).toUpperCase()}
            </span>
          )}
        </div>

        {/* Campaign info */}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-gray-800 truncate">
            {campaign?.title ?? 'Unknown Campaign'}
          </div>
          <div className="text-xs text-gray-500">
            {businessName} · Applied {appliedTime}
          </div>
        </div>

        {/* Status badge */}
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border flex-shrink-0 ${config.badgeClass}`}>
          {config.label}
        </span>
      </div>

      {/* Bottom row: rate + action */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-dc-teal">{rateDisplay}</span>
        <button
          onClick={handleAction}
          className={`text-xs px-3 py-1 rounded-full border transition-colors ${actionClass}`}
        >
          {actionLabel}
        </button>
      </div>
    </div>
  );
};

export default CreatorApplicationCard;
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/campaigns/CreatorApplicationCard.tsx
git commit -m "feat: add CreatorApplicationCard for Applied tab"
```

---

## Task 10: Integrate Everything into CreatorCampaignMarketplace

**Files:**
- Modify: `src/pages/CreatorCampaignMarketplace.tsx`

This is the integration task. Add tab bar, modal state management, wire up the detail modal + applied tab.

- [ ] **Step 1: Replace the full file**

This file needs significant restructuring. Replace `src/pages/CreatorCampaignMarketplace.tsx` entirely. Key changes from the current version:

1. **Remove:** Sheet import, ApplicationForm import, DeliveryTypeSelector import
2. **Add imports:** CampaignDetailModal, CreatorApplicationCard, useCreatorApplications
3. **Add state:** `activeTab`, `detailCampaign` (for modal), remove `showApplicationForm`
4. **Tab bar:** Available | Applied | Active (disabled) | Done (disabled)
5. **Swipe right:** opens detail modal instead of application sheet
6. **Applied tab:** renders list of CreatorApplicationCard components
7. **Desktop grid:** update Apply button to "View" and open modal too

```typescript
// src/pages/CreatorCampaignMarketplace.tsx

import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { usePublicCampaigns, PublicCampaign } from '@/hooks/usePublicCampaigns';
import { useCreatorApplications, CreatorApplication } from '@/hooks/useCreatorApplications';
import DashboardLayout from '@/components/DashboardLayout';
import { CampaignSwipeCard } from '@/components/campaigns/CampaignSwipeCard';
import { CampaignDetailModal } from '@/components/campaigns/CampaignDetailModal';
import { CreatorApplicationCard } from '@/components/campaigns/CreatorApplicationCard';
import MarketplaceLoadingState from '@/components/campaigns/MarketplaceLoadingState';
import MarketplaceErrorState from '@/components/campaigns/MarketplaceErrorState';
import { MapPin, Target } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { formatBudget } from '@/lib/campaignUtils';
import logo from '@/assets/Transparent_DragonCandy_logo.png';

type Tab = 'available' | 'applied' | 'active' | 'done';

const CreatorCampaignMarketplace = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: campaigns = [], isLoading, error } = usePublicCampaigns(user?.id);
  const { data: applications = [], isLoading: appsLoading } = useCreatorApplications();

  const [activeTab, setActiveTab] = useState<Tab>('available');
  const [detailCampaign, setDetailCampaign] = useState<PublicCampaign | null>(null);
  const [detailReadOnly, setDetailReadOnly] = useState(false);
  const [skippedIds, setSkippedIds] = useState<Set<string>>(new Set());

  const pendingCount = applications.filter(a => a.status === 'pending').length;

  if (isLoading) {
    return <MarketplaceLoadingState />;
  }

  if (error) {
    return <MarketplaceErrorState />;
  }

  const availableCampaigns = campaigns.filter(
    (c) => !c.user_applied && !skippedIds.has(c.id)
  );

  const handleSwipe = (direction: string, campaign: PublicCampaign) => {
    if (direction === 'right') {
      setDetailReadOnly(false);
      setDetailCampaign(campaign);
    } else if (direction === 'left') {
      setSkippedIds((prev) => new Set(prev).add(campaign.id));
    }
  };

  const handleViewDetail = (campaign: PublicCampaign) => {
    setDetailReadOnly(false);
    setDetailCampaign(campaign);
  };

  const handleApplicationSubmitted = () => {
    if (detailCampaign) {
      setSkippedIds((prev) => new Set(prev).add(detailCampaign.id));
    }
    setDetailCampaign(null);
    queryClient.invalidateQueries({ queryKey: ['public-campaigns'] });
    queryClient.invalidateQueries({ queryKey: ['creator-applications'] });
  };

  const handleViewApplicationDetail = (application: CreatorApplication) => {
    // Build a PublicCampaign-shaped object from the application data for the modal
    if (!application.campaign) return;
    const c = application.campaign;
    const pseudoCampaign: PublicCampaign = {
      id: c.id,
      title: c.title,
      user_id: c.user_id,
      description: c.description,
      goals: c.goals,
      style: c.style,
      tone: c.tone,
      status: 'published' as const,
      delivery_type: c.delivery_type,
      pricing_type: c.pricing_type,
      fixed_price: c.fixed_price,
      budget_min: c.budget_min,
      budget_max: c.budget_max,
      deliverables: c.deliverables,
      created_at: application.created_at,
      updated_at: application.updated_at,
      business_profile: application.business_profile ? {
        business_name: application.business_profile.business_name,
        logo_url: application.business_profile.logo_url ?? undefined,
        city: application.business_profile.city ?? undefined,
        country: application.business_profile.country ?? undefined,
      } : undefined,
    };
    setDetailReadOnly(true);
    setDetailCampaign(pseudoCampaign);
  };

  const tabs: { id: Tab; label: string; badge?: number; disabled?: boolean }[] = [
    { id: 'available', label: 'Available' },
    { id: 'applied', label: 'Applied', badge: pendingCount > 0 ? pendingCount : undefined },
    { id: 'active', label: 'Active', disabled: true },
    { id: 'done', label: 'Done', disabled: true },
  ];

  return (
    <DashboardLayout userRole="content_creator">
      <div className="flex flex-col min-h-screen bg-dc-gray">
        {/* Page Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <img src={logo} alt="Dragon Candy" className="w-12 h-12" />
          <div className="flex-1 px-3">
            <h1 className="text-xl font-bold text-gray-900 leading-tight">Campaigns</h1>
            <div className="flex items-center gap-1 mt-0.5">
              <MapPin className="w-3.5 h-3.5 text-dc-pink-accent flex-shrink-0" />
              <span className="text-xs text-gray-600">
                {availableCampaigns.length} campaign{availableCampaigns.length !== 1 ? 's' : ''} available
              </span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-full ring-2 ring-dc-teal overflow-hidden bg-dc-pink-bg flex items-center justify-center flex-shrink-0">
            <span className="text-sm font-bold text-dc-teal-dark">
              {user?.email?.charAt(0).toUpperCase() ?? 'C'}
            </span>
          </div>
        </div>

        {/* Tab Bar */}
        <div className="flex bg-white border-b-2 border-gray-100 px-4">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => !tab.disabled && setActiveTab(tab.id)}
              className={`flex-1 text-center py-3 text-sm font-semibold transition-colors relative ${
                tab.disabled
                  ? 'text-gray-300 cursor-not-allowed'
                  : activeTab === tab.id
                    ? 'text-dc-teal'
                    : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
              {tab.badge && (
                <span className="ml-1 bg-gray-100 text-gray-600 text-[10px] px-1.5 py-0.5 rounded-full">
                  {tab.badge}
                </span>
              )}
              {activeTab === tab.id && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-dc-teal" />
              )}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === 'available' && (
          <>
            {/* Swipe card stack — mobile */}
            <div className="flex-1 px-4 pb-4 md:hidden">
              <div className="pt-4">
                <CampaignSwipeCard
                  campaigns={availableCampaigns}
                  onSwipe={handleSwipe}
                  onViewDetail={handleViewDetail}
                />
              </div>
              {availableCampaigns.length > 0 && (
                <div className="flex items-center justify-center gap-6 mt-4">
                  <span className="text-xs text-white/50">← Skip</span>
                  <span className="text-xs text-white/50">View Details →</span>
                </div>
              )}
            </div>

            {/* Grid view — desktop */}
            <div className="hidden md:block px-4 pb-8 pt-4">
              {availableCampaigns.length === 0 ? (
                <div className="border-2 border-dc-teal rounded-2xl p-10 text-center max-w-md mx-auto">
                  <Target className="h-10 w-10 text-dc-teal mx-auto mb-3" />
                  <h3 className="font-bold text-gray-900 mb-1">No campaigns available</h3>
                  <p className="text-sm text-gray-500">You've reviewed all available campaigns. Check back soon for new opportunities!</p>
                </div>
              ) : (
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-6xl mx-auto">
                  {availableCampaigns.map((campaign) => (
                    <Card
                      key={campaign.id}
                      className="hover:shadow-lg transition-shadow cursor-pointer border-2 border-transparent hover:border-dc-teal/30"
                      onClick={() => handleViewDetail(campaign)}
                    >
                      <CardContent className="p-5 space-y-3">
                        <h3 className="font-bold text-gray-900 text-base leading-tight line-clamp-2">
                          {campaign.title}
                        </h3>
                        {campaign.description && (
                          <p className="text-sm text-gray-500 line-clamp-2">{campaign.description}</p>
                        )}
                        <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                          <span className="text-sm text-dc-teal font-semibold">{formatBudget(campaign)}</span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleViewDetail(campaign);
                            }}
                            className="rounded-full bg-dc-teal text-white text-xs font-bold px-4 py-1.5 hover:bg-dc-teal-dark transition-colors"
                          >
                            View
                          </button>
                        </div>
                        {campaign.business_profile?.business_name && (
                          <p className="text-xs text-gray-400">by {campaign.business_profile.business_name}</p>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {activeTab === 'applied' && (
          <div className="flex-1 px-4 py-4">
            {appsLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="bg-white rounded-2xl p-4 animate-pulse">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-gray-200" />
                      <div className="flex-1">
                        <div className="h-4 bg-gray-200 rounded w-3/4 mb-1" />
                        <div className="h-3 bg-gray-200 rounded w-1/2" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : applications.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-white/70 text-sm mb-2">No applications yet.</p>
                <button
                  onClick={() => setActiveTab('available')}
                  className="text-dc-teal text-sm font-semibold hover:underline"
                >
                  Browse available campaigns to get started.
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {applications.map((app) => (
                  <CreatorApplicationCard
                    key={app.id}
                    application={app}
                    onViewDetails={handleViewApplicationDetail}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Detail Modal */}
        {detailCampaign && (
          <CampaignDetailModal
            campaign={detailCampaign}
            isOpen={!!detailCampaign}
            onClose={() => setDetailCampaign(null)}
            onApplicationSubmitted={handleApplicationSubmitted}
            readOnly={detailReadOnly}
          />
        )}
      </div>
    </DashboardLayout>
  );
};

export default CreatorCampaignMarketplace;
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 3: Manual smoke test**

Run: `npm run dev`

Test the following:
1. Navigate to creator dashboard → Campaigns
2. Tab bar shows: Available (active), Applied, Active (grayed), Done (grayed)
3. Campaign cards show real titles, business names, budgets, content type pills
4. Tap a card → detail modal slides up with full brief
5. Tap "Apply for This Campaign" → inline form appears
6. Submit application → success message → card consumed
7. Switch to Applied tab → application appears with Pending badge
8. Tap "View Details" on applied card → detail modal opens read-only (no apply button)

- [ ] **Step 4: Commit**

```bash
git add src/pages/CreatorCampaignMarketplace.tsx
git commit -m "creator-campaigns: full campaign details with visual briefs"
```

---

## Task 11: Final Build Verification

- [ ] **Step 1: Full build check**

Run: `npm run build`
Expected: Build succeeds with 0 errors. Warnings about unused variables are acceptable if they come from pre-existing code.

- [ ] **Step 2: Check for TypeScript errors**

Run: `npx tsc --noEmit`
Expected: No new errors introduced by our changes.

- [ ] **Step 3: Final commit (if any fixups needed)**

If Steps 1-2 revealed issues, fix them and commit:

```bash
git add -A
git commit -m "fix: resolve build errors from campaign discovery integration"
```
