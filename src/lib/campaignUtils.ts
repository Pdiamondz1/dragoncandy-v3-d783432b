// src/lib/campaignUtils.ts

import type { DeliveryTier } from '@/types/campaignMedia';
import { TIER_LIMITS } from '@/types/campaignMedia';
import { resolveProfileAssetUrl } from '@/hooks/useSignedUrl';

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
 * Maps UI DeliveryTier values to the DB delivery_type column values.
 * The DB CHECK constraint expects ('standard', 'expedited', 'dragonrush').
 */
export function mapDeliveryTierToDb(tier: DeliveryTier): string {
  switch (tier) {
    case 'dragondash': return 'dragonrush';
    case 'express': return 'expedited';
    case 'standard': return 'standard';
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

export function formatRelativeTime(isoDate: string): string {
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const seconds = Math.max(1, Math.floor(diffMs / 1000));
  const minutes = Math.floor(diffMs / 60_000);
  const hours = Math.floor(diffMs / 3_600_000);
  const days = Math.floor(diffMs / 86_400_000);

  if (minutes < 1) return `${seconds} ${seconds === 1 ? 'second' : 'seconds'} ago`;
  if (hours < 1) return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`;
  if (days < 1) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  return `${days} ${days === 1 ? 'day' : 'days'} ago`;
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
  return Math.round(R * c * 10) / 10;
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
  if (campaign.fixed_price) return `$${campaign.fixed_price.toLocaleString()}`;
  if (campaign.budget_max) return `$${campaign.budget_max.toLocaleString()}`;
  if (campaign.budget_min) return `$${campaign.budget_min.toLocaleString()}`;
  return 'Budget TBD';
}

/**
 * Formats a campaign's price label, accounting for free group ("crew") campaigns.
 * A group campaign (`group_id` set) is always a free collab — `formatBudget` would
 * otherwise render "Budget TBD" for its `fixed_price = 0`. Public campaigns never
 * carry `group_id`, so they fall through to the normal budget formatting unchanged.
 */
export function formatCampaignPrice(campaign: {
  group_id?: string | null;
  pricing_type?: string | null;
  fixed_price?: number | null;
  budget_min?: number | null;
  budget_max?: number | null;
}): string {
  if (campaign.group_id != null) return 'Free collab';
  return formatBudget(campaign);
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
  const refImage = mediaItems?.find(m => m.media_type === 'reference_image');
  if (refImage) return { url: refImage.file_url, type: 'reference' };

  const aiPreview = mediaItems?.find(m => m.media_type === 'ai_preview');
  if (aiPreview && aiPreviewStatus === 'ready') return { url: aiPreview.file_url, type: 'ai_preview' };

  // The business logo is stored as a `profile-assets` storage key — resolve it to a
  // public URL before it reaches an <img src> (reference/ai_preview are already URLs).
  if (businessLogoUrl) return { url: resolveProfileAssetUrl(businessLogoUrl) ?? null, type: 'logo' };

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

export interface CampaignCost {
  baseCostPerDeliverable: number;
  premiumAmount: number;
  budgetTotal: number;
}

/**
 * The cost breakdown for a campaign, for `<CostBreakdown />`.
 *
 * `fixedPrice` is the **base** the creator is paid; the delivery-tier premium sits on
 * top of it. That matches `create-campaign-escrow`, which charges
 * `fixed_price + delivery_fee` — the authority on what the business is actually billed.
 *
 * This lives here because the builder and the edit page each used to compute it inline
 * and had drifted apart: the edit page treated `fixed_price` as *inclusive* of the
 * premium and showed it as the total, so it quoted a number lower than the charge.
 * One function, one answer.
 */
export function computeCampaignCost(
  fixedPrice: number,
  tier: DeliveryTier | null,
  deliverableCount: number
): CampaignCost {
  const premiumAmount = getTierConfig(tier)?.fee ?? 0;
  return {
    baseCostPerDeliverable: deliverableCount > 0 ? fixedPrice / deliverableCount : 0,
    premiumAmount,
    budgetTotal: fixedPrice + premiumAmount,
  };
}
