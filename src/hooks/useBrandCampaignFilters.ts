import { useState, useMemo } from 'react';
import { SponsorshipCampaign } from './useSponsorshipCampaigns';
import { BrandCampaignFilters } from '@/components/campaigns/BrandCampaignFilters';

export const useBrandCampaignFilters = (campaigns: SponsorshipCampaign[]) => {
  const [filters, setFilters] = useState<BrandCampaignFilters>({
    searchTerm: '',
    location: '',
    industry: 'all',
    platforms: [],
    budgetMin: '',
    budgetMax: '',
    sortBy: 'created_at',
    sortOrder: 'desc',
  });

  const filteredCampaigns = useMemo(() => {
    let filtered = [...campaigns];

    // Search filter
    if (filters.searchTerm) {
      const searchLower = filters.searchTerm.toLowerCase();
      filtered = filtered.filter(
        (campaign) =>
          campaign.title?.toLowerCase().includes(searchLower) ||
          campaign.description?.toLowerCase().includes(searchLower) ||
          campaign.business_profile?.business_name?.toLowerCase().includes(searchLower)
      );
    }

    // Location filter
    if (filters.location) {
      const locationLower = filters.location.toLowerCase();
      filtered = filtered.filter((campaign) =>
        campaign.business_profile?.location?.toLowerCase().includes(locationLower)
      );
    }

    // Industry filter
    if (filters.industry && filters.industry !== 'all') {
      filtered = filtered.filter(
        (campaign) => campaign.business_profile?.industry === filters.industry
      );
    }

    // Platforms filter
    if (filters.platforms.length > 0) {
      filtered = filtered.filter((campaign) =>
        campaign.platforms?.some((platform) =>
          filters.platforms.includes(platform)
        )
      );
    }

    // Budget filter
    if (filters.budgetMin) {
      const minBudget = parseFloat(filters.budgetMin);
      filtered = filtered.filter(
        (campaign) => campaign.budget_max && campaign.budget_max >= minBudget
      );
    }

    if (filters.budgetMax) {
      const maxBudget = parseFloat(filters.budgetMax);
      filtered = filtered.filter(
        (campaign) => campaign.budget_min && campaign.budget_min <= maxBudget
      );
    }

    // Sorting
    filtered.sort((a, b) => {
      let aValue: any;
      let bValue: any;

      switch (filters.sortBy) {
        case 'budget_min':
          aValue = a.budget_min || 0;
          bValue = b.budget_min || 0;
          break;
        case 'deadline':
          aValue = a.deadline ? new Date(a.deadline).getTime() : 0;
          bValue = b.deadline ? new Date(b.deadline).getTime() : 0;
          break;
        case 'created_at':
        default:
          aValue = new Date(a.created_at).getTime();
          bValue = new Date(b.created_at).getTime();
          break;
      }

      if (filters.sortOrder === 'asc') {
        return aValue - bValue;
      } else {
        return bValue - aValue;
      }
    });

    return filtered;
  }, [campaigns, filters]);

  const updateFilter = (key: keyof BrandCampaignFilters, value: any) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const resetFilters = () => {
    setFilters({
      searchTerm: '',
      location: '',
      industry: 'all',
      platforms: [],
      budgetMin: '',
      budgetMax: '',
      sortBy: 'created_at',
      sortOrder: 'desc',
    });
  };

  return {
    filters,
    filteredCampaigns,
    updateFilter,
    resetFilters,
  };
};
