import { useState, useMemo, useCallback } from 'react';
import type { GeoEnrichedCampaign } from '@/hooks/useGeoDistance';

export type ContentTypeFilter = 'all' | 'photo' | 'video' | 'reel' | 'story' | 'carousel';
export type DeliveryTierFilter = 'all' | 'dragonrush' | 'expedited' | 'standard';
export type SortOption = 'nearest' | 'newest' | 'budget' | 'ending_soon';
export type DistanceRadius = 'any' | 5 | 10 | 25 | 50;
export type BudgetMinPreset = 'any' | 50 | 100 | 250;
export type BudgetMaxPreset = 'any' | 250 | 500 | 1000 | 2000;

export const VIDEO_TYPES = ['video_reel', 'tiktok', 'youtube_short'];
const REEL_TYPES = VIDEO_TYPES; // Same for MVP

export interface CampaignFilterState {
  searchTerm: string;
  contentType: ContentTypeFilter;
  deliveryTier: DeliveryTierFilter;
  sortBy: SortOption;
  distanceRadius: DistanceRadius;
  budgetMin: BudgetMinPreset;
  budgetMax: BudgetMaxPreset;
}

interface BudgetFields {
  fixed_price?: number | null;
  budget_min?: number | null;
  budget_max?: number | null;
}

export function matchesDistance(
  distanceMiles: number | null,
  radius: DistanceRadius,
): boolean {
  if (radius === 'any') return true;
  if (distanceMiles === null) return true;
  return distanceMiles <= radius;
}

export function matchesBudget(
  campaign: BudgetFields,
  filterMin: BudgetMinPreset,
  filterMax: BudgetMaxPreset,
): boolean {
  const { fixed_price, budget_min, budget_max } = campaign;
  if (fixed_price == null && budget_min == null && budget_max == null) return true;
  const maxPayout = fixed_price ?? budget_max ?? 0;
  const entryPrice = fixed_price ?? budget_min ?? 0;
  if (filterMin !== 'any' && maxPayout < filterMin) return false;
  if (filterMax !== 'any' && entryPrice > filterMax) return false;
  return true;
}

function matchesContentType(campaign: GeoEnrichedCampaign, filter: ContentTypeFilter): boolean {
  if (filter === 'all') return true;
  const types = campaign.content_types ?? [];
  if (filter === 'video') return types.some((t) => VIDEO_TYPES.includes(t));
  if (filter === 'reel') return types.some((t) => REEL_TYPES.includes(t));
  return types.includes(filter);
}

function matchesDeliveryTier(campaign: GeoEnrichedCampaign, filter: DeliveryTierFilter): boolean {
  if (filter === 'all') return true;
  return campaign.delivery_type === filter;
}

function matchesSearch(campaign: GeoEnrichedCampaign, term: string): boolean {
  if (!term) return true;
  const lower = term.toLowerCase();
  return (
    campaign.title.toLowerCase().includes(lower) ||
    (campaign.description ?? '').toLowerCase().includes(lower) ||
    (campaign.business_profile?.business_name ?? '').toLowerCase().includes(lower)
  );
}

function getBudgetValue(campaign: GeoEnrichedCampaign): number {
  return campaign.fixed_price ?? campaign.budget_max ?? 0;
}

function sortCampaigns(campaigns: GeoEnrichedCampaign[], sortBy: SortOption): GeoEnrichedCampaign[] {
  return [...campaigns].sort((a, b) => {
    switch (sortBy) {
      case 'nearest': {
        const aDist = a.distanceMiles ?? Infinity;
        const bDist = b.distanceMiles ?? Infinity;
        return aDist - bDist;
      }
      case 'newest':
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      case 'budget':
        return getBudgetValue(b) - getBudgetValue(a);
      case 'ending_soon': {
        const aDeadline = a.deadline ? new Date(a.deadline).getTime() : Infinity;
        const bDeadline = b.deadline ? new Date(b.deadline).getTime() : Infinity;
        return aDeadline - bDeadline;
      }
      default:
        return 0;
    }
  });
}

export const useCampaignFilters = (campaigns: GeoEnrichedCampaign[]) => {
  const [filters, setFilters] = useState<CampaignFilterState>({
    searchTerm: '',
    contentType: 'all',
    deliveryTier: 'all',
    sortBy: 'newest',
    distanceRadius: 'any',
    budgetMin: 'any',
    budgetMax: 'any',
  });

  const setSearchTerm = useCallback((term: string) => {
    setFilters((prev) => ({ ...prev, searchTerm: term }));
  }, []);

  const setContentType = useCallback((ct: ContentTypeFilter) => {
    setFilters((prev) => ({ ...prev, contentType: ct }));
  }, []);

  const setDeliveryTier = useCallback((dt: DeliveryTierFilter) => {
    setFilters((prev) => ({ ...prev, deliveryTier: dt }));
  }, []);

  const setSortBy = useCallback((sort: SortOption) => {
    setFilters((prev) => ({ ...prev, sortBy: sort }));
  }, []);

  const setDistanceRadius = useCallback((r: DistanceRadius) => {
    setFilters((prev) => ({ ...prev, distanceRadius: r }));
  }, []);

  const setBudgetMin = useCallback((min: BudgetMinPreset) => {
    setFilters((prev) => {
      const next = { ...prev, budgetMin: min };
      if (min !== 'any' && prev.budgetMax !== 'any' && min > prev.budgetMax) {
        next.budgetMax = 'any';
      }
      return next;
    });
  }, []);

  const setBudgetMax = useCallback((max: BudgetMaxPreset) => {
    setFilters((prev) => ({ ...prev, budgetMax: max }));
  }, []);

  const clearFilters = useCallback(() => {
    setFilters({
      searchTerm: '', contentType: 'all', deliveryTier: 'all',
      sortBy: 'newest', distanceRadius: 'any', budgetMin: 'any', budgetMax: 'any',
    });
  }, []);

  const hasActiveFilters = filters.searchTerm !== '' ||
    filters.contentType !== 'all' ||
    filters.deliveryTier !== 'all' ||
    filters.distanceRadius !== 'any' ||
    filters.budgetMin !== 'any' ||
    filters.budgetMax !== 'any';

  const filteredCampaigns = useMemo(() => {
    const filtered = campaigns.filter(
      (c) =>
        matchesSearch(c, filters.searchTerm) &&
        matchesContentType(c, filters.contentType) &&
        matchesDeliveryTier(c, filters.deliveryTier) &&
        matchesDistance(c.distanceMiles, filters.distanceRadius) &&
        matchesBudget(c, filters.budgetMin, filters.budgetMax),
    );
    return sortCampaigns(filtered, filters.sortBy);
  }, [campaigns, filters]);

  return {
    filters,
    filteredCampaigns,
    hasActiveFilters,
    setSearchTerm,
    setContentType,
    setDeliveryTier,
    setSortBy,
    setDistanceRadius,
    setBudgetMin,
    setBudgetMax,
    clearFilters,
  };
};
