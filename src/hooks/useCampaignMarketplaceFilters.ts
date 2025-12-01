import { useState, useMemo } from 'react';
import { PublicCampaign } from '@/hooks/usePublicCampaigns';

export interface CampaignMarketplaceFilters {
  searchTerm: string;
  platforms: string[];
  budgetMin: number | null;
  budgetMax: number | null;
  postal_code: string;
  city: string;
  country: string;
  _isLocationAutoFilled?: boolean;
  sortBy: 'created_at' | 'budget_max' | 'deadline' | 'application_count';
  sortOrder: 'asc' | 'desc';
}

export const useCampaignMarketplaceFilters = (campaigns: PublicCampaign[]) => {
  const [filters, setFilters] = useState<CampaignMarketplaceFilters>({
    searchTerm: '',
    platforms: [],
    budgetMin: null,
    budgetMax: null,
    postal_code: '',
    city: '',
    country: '',
    _isLocationAutoFilled: false,
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

    // Smart Location Filtering
    if (filters._isLocationAutoFilled && filters.postal_code) {
      // When postal code is auto-filled, only filter by postal code
      const postalLower = filters.postal_code.toLowerCase();
      filtered = filtered.filter(campaign =>
        campaign.business_profile?.postal_code?.toLowerCase().includes(postalLower)
      );
    } else {
      // Manual location filtering - each field works independently
      if (filters.postal_code) {
        const postalLower = filters.postal_code.toLowerCase();
        filtered = filtered.filter(campaign =>
          campaign.business_profile?.postal_code?.toLowerCase().includes(postalLower)
        );
      }

      if (filters.city) {
        const cityLower = filters.city.toLowerCase();
        filtered = filtered.filter(campaign =>
          campaign.business_profile?.city?.toLowerCase().includes(cityLower)
        );
      }

      if (filters.country) {
        const countryLower = filters.country.toLowerCase();
        filtered = filtered.filter(campaign =>
          campaign.business_profile?.country?.toLowerCase().includes(countryLower)
        );
      }
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
      postal_code: '',
      city: '',
      country: '',
      _isLocationAutoFilled: false,
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
