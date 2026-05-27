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
      const query = supabase
        .from('organizations')
        .select(`
          id, name, logo_url, org_type,
          org_units ( address, brand_category )
        `)
        .is('deleted_at', null)
        .eq('org_units.is_primary', true)
        .ilike('name', `%${debouncedTerm}%`)
        .limit(8);

      const { data, error } = await query;
      if (error) throw error;

      return (data ?? []).map((org) => {
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
    },
    enabled: enabled && debouncedTerm.trim().length > 0,
    staleTime: 30_000,
  });
}
