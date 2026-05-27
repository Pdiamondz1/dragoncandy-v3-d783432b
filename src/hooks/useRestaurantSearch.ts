// src/hooks/useRestaurantSearch.ts
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface RestaurantSearchResult {
  id: string;
  name: string;
  logo_url: string | null;
  org_type: string;
  address: string | null;
  brand_category: string | null;
}

export function useRestaurantSearch(searchTerm: string, enabled = true) {
  const [debouncedTerm, setDebouncedTerm] = useState(searchTerm);

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedTerm(searchTerm), 300);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  return useQuery({
    queryKey: ['restaurant-search', debouncedTerm],
    queryFn: async (): Promise<RestaurantSearchResult[]> => {
      const { data, error } = await supabase.rpc('search_restaurants', {
        search_term: debouncedTerm,
        result_limit: 8,
      });
      if (error) throw error;
      return (data ?? []) as RestaurantSearchResult[];
    },
    enabled: enabled && debouncedTerm.trim().length > 0,
    staleTime: 30_000,
  });
}
