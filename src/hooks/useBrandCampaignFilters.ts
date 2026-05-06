import { useState, useMemo } from 'react';
import { SponsorshipCampaign } from './useSponsorshipCampaigns';

export interface BrandCampaignFilters {
  searchTerm: string;
  postal_code: string;
  city: string;
  country: string;
  _isLocationAutoFilled?: boolean;
  industry: string;
  platforms: string[];
  budgetMin: number | null;
  budgetMax: number | null;
  sortBy: 'created_at' | 'budget_min' | 'deadline';
  sortOrder: 'asc' | 'desc';
}

export const useBrandCampaignFilters = (campaigns: SponsorshipCampaign[]) => {
  const [filters, setFilters] = useState<BrandCampaignFilters>({
    searchTerm: '',
    postal_code: '',
    city: '',
    country: '',
    _isLocationAutoFilled: false,
    industry: 'all',
    platforms: [],
    budgetMin: null,
    budgetMax: null,
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
    if (filters.budgetMin !== null) {
      filtered = filtered.filter(
        (campaign) => campaign.budget_max && campaign.budget_max >= filters.budgetMin!
      );
    }

    if (filters.budgetMax !== null) {
      filtered = filtered.filter(
        (campaign) => campaign.budget_min && campaign.budget_min <= filters.budgetMax!
      );
    }

    // Sorting
    filtered.sort((a, b) => {
      let aValue: number;
      let bValue: number;

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

  const updateFilter = (key: string, value: string | string[] | boolean | number | null) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const resetFilters = () => {
    setFilters({
      searchTerm: '',
      postal_code: '',
      city: '',
      country: '',
      _isLocationAutoFilled: false,
      industry: 'all',
      platforms: [],
      budgetMin: null,
      budgetMax: null,
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
