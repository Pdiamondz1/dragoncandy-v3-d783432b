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
      const { data, error } = await supabase.rpc('search_restaurants', {
        search_term: debouncedSearch,
        cuisine_filter: filters.cuisine ?? undefined,
        // Was a hard 30, which showed a fraction of the 520 eligible restaurants and made a
        // populated marketplace look empty. Fetch the eligible set and let the EXISTING client
        // pager (`usePagedList(restaurants, 12)` + `LoadMoreButton`, in both consumers) control
        // what renders — so nothing is unreachable, and the sheet still paints 12 cards at a time
        // rather than 520. Adding server-side paging here would fight that pager, not help it.
        // The payload is small (~8 scalar columns/row). The typeahead in useRestaurantSearch keeps
        // its 8 — that one is a dropdown, where a long list would be worse.
        result_limit: 1000,
      });
      if (error) throw error;
      return (data ?? []) as RestaurantSearchResult[];
    },
    staleTime: 30_000,
  });

  const { data: cuisines } = useQuery({
    queryKey: ['restaurant-cuisines'],
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase.rpc('list_restaurant_cuisines');
      if (error) throw error;
      return (data ?? []).map((row: { cuisine: string }) => row.cuisine);
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
