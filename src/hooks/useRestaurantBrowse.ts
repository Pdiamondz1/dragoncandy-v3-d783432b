// src/hooks/useRestaurantBrowse.ts
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { RestaurantSearchResult } from '@/hooks/useRestaurantSearch';

export interface BrowseFilters {
  search: string;
  cuisine: string | null;
}

export function useRestaurantBrowse() {
  const [filters, setFilters] = useState<BrowseFilters>({ search: '', cuisine: null });
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedSearch(filters.search), 300);
    return () => clearTimeout(handler);
  }, [filters.search]);

  const { data: restaurants, isLoading } = useQuery({
    queryKey: ['restaurant-browse', debouncedSearch, filters.cuisine],
    queryFn: async (): Promise<RestaurantSearchResult[]> => {
      let query = supabase
        .from('organizations')
        .select('id, name, logo_url, org_type, org_units ( address, brand_category )')
        .is('deleted_at', null)
        .eq('org_units.is_primary', true)
        .limit(30);

      if (debouncedSearch.trim()) {
        query = query.ilike('name', `%${debouncedSearch}%`);
      }

      const { data, error } = await query;
      if (error) throw error;

      let results: RestaurantSearchResult[] = (data ?? []).map((org) => {
        const unit = Array.isArray(org.org_units) ? org.org_units[0] : org.org_units;
        return {
          id: org.id,
          name: org.name,
          logo_url: org.logo_url,
          org_type: org.org_type,
          address: unit?.address ?? null,
          brand_category: unit?.brand_category ?? null,
        };
      });

      if (filters.cuisine) {
        results = results.filter(
          (r) => r.brand_category?.toLowerCase() === filters.cuisine!.toLowerCase()
        );
      }

      return results;
    },
    staleTime: 30_000,
  });

  const { data: cuisines } = useQuery({
    queryKey: ['restaurant-cuisines'],
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from('org_units')
        .select('brand_category')
        .eq('is_primary', true)
        .not('brand_category', 'is', null);
      if (error) throw error;
      const unique = [...new Set((data ?? []).map((u) => u.brand_category!).filter(Boolean))];
      return unique.sort();
    },
    staleTime: 60_000,
  });

  function setSearch(search: string) {
    setFilters((prev) => ({ ...prev, search }));
  }

  function setCuisine(cuisine: string | null) {
    setFilters((prev) => ({ ...prev, cuisine }));
  }

  function resetFilters() {
    setFilters({ search: '', cuisine: null });
  }

  return {
    restaurants: restaurants ?? [],
    cuisines: cuisines ?? [],
    isLoading,
    filters,
    setSearch,
    setCuisine,
    resetFilters,
  };
}
