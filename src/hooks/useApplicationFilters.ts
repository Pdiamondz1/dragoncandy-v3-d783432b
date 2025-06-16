import { useState, useMemo } from 'react';
import { CampaignApplication } from '@/types/applications';

export interface ApplicationFilters {
  status: 'all' | 'pending' | 'accepted' | 'rejected';
  sortBy: 'created_at' | 'proposed_rate' | 'creator_name';
  sortOrder: 'asc' | 'desc';
  searchTerm: string;
}

export const useApplicationFilters = (applications: CampaignApplication[]) => {
  const [filters, setFilters] = useState<ApplicationFilters>({
    status: 'all',
    sortBy: 'created_at',
    sortOrder: 'desc',
    searchTerm: '',
  });

  const filteredApplications = useMemo(() => {
    let filtered = [...applications];

    // Filter by status
    if (filters.status !== 'all') {
      filtered = filtered.filter(app => app.status === filters.status);
    }

    // Filter by search term
    if (filters.searchTerm) {
      const searchLower = filters.searchTerm.toLowerCase();
      filtered = filtered.filter(app => 
        app.creator_profile?.creator_name?.toLowerCase().includes(searchLower) ||
        app.intro_message?.toLowerCase().includes(searchLower) ||
        app.creator_profile?.bio?.toLowerCase().includes(searchLower)
      );
    }

    // Sort applications
    filtered.sort((a, b) => {
      let aValue: any;
      let bValue: any;

      switch (filters.sortBy) {
        case 'created_at':
          aValue = new Date(a.created_at);
          bValue = new Date(b.created_at);
          break;
        case 'proposed_rate':
          aValue = a.proposed_rate || 0;
          bValue = b.proposed_rate || 0;
          break;
        case 'creator_name':
          aValue = a.creator_profile?.creator_name || '';
          bValue = b.creator_profile?.creator_name || '';
          break;
        default:
          return 0;
      }

      if (aValue < bValue) return filters.sortOrder === 'asc' ? -1 : 1;
      if (aValue > bValue) return filters.sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [applications, filters]);

  const updateFilter = (key: keyof ApplicationFilters, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const resetFilters = () => {
    setFilters({
      status: 'all',
      sortBy: 'created_at',
      sortOrder: 'desc',
      searchTerm: '',
    });
  };

  return {
    filters,
    filteredApplications,
    updateFilter,
    resetFilters,
  };
};
