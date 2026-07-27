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
        // 520 restaurants are eligible; the previous 30 was a hard cap that made a populated
        // marketplace look empty. The sheet has a search box and category chips for narrowing, so
        // a larger page beats pagination here. (The typeahead in useRestaurantSearch keeps its 8 —
        // that one is a dropdown, where a long list would be worse.)
        result_limit: 200,
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
