
import { useState, useMemo } from 'react';
import { PublicCampaign } from '@/hooks/usePublicCampaigns';
import { CampaignMarketplaceFilters } from '@/components/campaigns/CampaignMarketplaceFilters';

export const useCampaignMarketplaceFilters = (campaigns: PublicCampaign[]) => {
  const [filters, setFilters] = useState<CampaignMarketplaceFilters>({
    searchTerm: '',
    platforms: [],
    budgetMin: null,
    budgetMax: null,
    location: '',
    sortBy: 'created_at',
    sortOrder: 'desc',
  });

  const filteredCampaigns = useMemo(() => {
    let filtered = [...campaigns];

    // Search filter
    if (filters.searchTerm) {
      const searchLower = filters.searchTerm.toLowerCase();
      filtered = filtered.filter(campaign => 
        campaign.title.toLowerCase().includes(searchLower) ||
        campaign.description?.toLowerCase().includes(searchLower) ||
        campaign.business_profile?.business_name?.toLowerCase().includes(searchLower)
      );
    }

    // Platform filter
    if (filters.platforms.length > 0) {
      filtered = filtered.filter(campaign =>
        campaign.platforms?.some(platform => filters.platforms.includes(platform))
      );
    }

    // Budget filters
    if (filters.budgetMin !== null) {
      filtered = filtered.filter(campaign =>
        campaign.budget_max ? campaign.budget_max >= filters.budgetMin! : true
      );
    }

    if (filters.budgetMax !== null) {
      filtered = filtered.filter(campaign =>
        campaign.budget_min ? campaign.budget_min <= filters.budgetMax! : true
      );
    }

    // Location filter
    if (filters.location) {
      const locationLower = filters.location.toLowerCase();
      filtered = filtered.filter(campaign =>
        campaign.business_profile?.location?.toLowerCase().includes(locationLower)
      );
    }

    // Sort campaigns
    filtered.sort((a, b) => {
      let aValue: any;
      let bValue: any;

      switch (filters.sortBy) {
        case 'created_at':
          aValue = new Date(a.created_at);
          bValue = new Date(b.created_at);
          break;
        case 'budget_max':
          aValue = a.budget_max || 0;
          bValue = b.budget_max || 0;
          break;
        case 'deadline':
          aValue = a.deadline ? new Date(a.deadline) : new Date('9999-12-31');
          bValue = b.deadline ? new Date(b.deadline) : new Date('9999-12-31');
          break;
        case 'application_count':
          aValue = a.application_count || 0;
          bValue = b.application_count || 0;
          break;
        default:
          return 0;
      }

      if (aValue < bValue) return filters.sortOrder === 'asc' ? -1 : 1;
      if (aValue > bValue) return filters.sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [campaigns, filters]);

  const updateFilter = (key: keyof CampaignMarketplaceFilters, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const resetFilters = () => {
    setFilters({
      searchTerm: '',
      platforms: [],
      budgetMin: null,
      budgetMax: null,
      location: '',
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
