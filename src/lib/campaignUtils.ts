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
  const refImage = mediaItems?.find(m => m.media_type === 'reference_image');
  if (refImage) return { url: refImage.file_url, type: 'reference' };

  const aiPreview = mediaItems?.find(m => m.media_type === 'ai_preview');
  if (aiPreview && aiPreviewStatus === 'ready') return { url: aiPreview.file_url, type: 'ai_preview' };

  if (businessLogoUrl) return { url: businessLogoUrl, type: 'logo' };

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
