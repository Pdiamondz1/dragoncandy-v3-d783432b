import { useState, useMemo, useCallback } from 'react';
import type { PublicCampaign } from '@/hooks/usePublicCampaigns';

export type ContentTypeFilter = 'all' | 'photo' | 'reel' | 'story' | 'carousel';
export type DeliveryTierFilter = 'all' | 'dragonrush' | 'expedited' | 'standard';
export type SortOption = 'newest' | 'budget' | 'ending_soon';

const REEL_TYPES = ['video_reel', 'tiktok', 'youtube_short'];

export interface CampaignFilterState {
  searchTerm: string;
  contentType: ContentTypeFilter;
  deliveryTier: DeliveryTierFilter;
  sortBy: SortOption;
}

function matchesContentType(campaign: PublicCampaign, filter: ContentTypeFilter): boolean {
  if (filter === 'all') return true;
  const types = campaign.content_types ?? [];
  if (filter === 'reel') return types.some((t) => REEL_TYPES.includes(t));
  return types.includes(filter);
}

function matchesDeliveryTier(campaign: PublicCampaign, filter: DeliveryTierFilter): boolean {
  if (filter === 'all') return true;
  return campaign.delivery_type === filter;
}

function matchesSearch(campaign: PublicCampaign, term: string): boolean {
  if (!term) return true;
  const lower = term.toLowerCase();
  return (
    campaign.title.toLowerCase().includes(lower) ||
    (campaign.description ?? '').toLowerCase().includes(lower) ||
    (campaign.business_profile?.business_name ?? '').toLowerCase().includes(lower)
  );
}

function getBudgetValue(campaign: PublicCampaign): number {
  return campaign.fixed_price ?? campaign.budget_max ?? 0;
}

function sortCampaigns(campaigns: PublicCampaign[], sortBy: SortOption): PublicCampaign[] {
  return [...campaigns].sort((a, b) => {
    switch (sortBy) {
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

export const useCampaignFilters = (campaigns: PublicCampaign[]) => {
  const [filters, setFilters] = useState<CampaignFilterState>({
    searchTerm: '',
    contentType: 'all',
    deliveryTier: 'all',
    sortBy: 'newest',
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

  const clearFilters = useCallback(() => {
    setFilters({ searchTerm: '', contentType: 'all', deliveryTier: 'all', sortBy: 'newest' });
  }, []);

  const hasActiveFilters = filters.searchTerm !== '' ||
    filters.contentType !== 'all' ||
    filters.deliveryTier !== 'all';

  const filteredCampaigns = useMemo(() => {
    const filtered = campaigns.filter(
      (c) =>
        matchesSearch(c, filters.searchTerm) &&
        matchesContentType(c, filters.contentType) &&
        matchesDeliveryTier(c, filters.deliveryTier),
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
    clearFilters,
  };
};
