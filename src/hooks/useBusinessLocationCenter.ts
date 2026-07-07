import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { geocodingService } from '@/lib/geocoding';
import { lookupCityCoords } from '@/lib/geoUtils';
import type { LocationCenter } from '@/lib/creatorLocationFilter';

/**
 * Resolves the caller's saved business location (restaurant or brand) into a map center for the
 * "near me" default. Precise ZIP geocoding first, else static US-city coords, else a city/country
 * geocode. Returns null when the business has no usable city/postal_code (control then prompts
 * "Set your area").
 */
export const useBusinessLocationCenter = (accountType: 'restaurant' | 'brand' = 'restaurant') => {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['business-location-center', user?.id, accountType],
    queryFn: async (): Promise<LocationCenter | null> => {
      const { data, error } = await supabase
        .from('business_profiles')
        .select('business_name, city, postal_code, country, location')
        .eq('user_id', user!.id)
        .eq('account_type', accountType)
        .maybeSingle();

      if (error) {
        console.error('Error loading business location:', error);
        return null;
      }
      if (!data) return null;

      const { city, postal_code, country, business_name } = data;
      if (!city && !postal_code) return null; // nothing to geocode

      let coords: { lat: number; lng: number } | null = null;
      if (postal_code) {
        coords = await geocodingService.geocodeLocation(
          postal_code,
          city ?? undefined,
          country ?? undefined,
        );
      }
      if (!coords && city && country) {
        coords = lookupCityCoords(city, country);
      }
      if (!coords) {
        coords = await geocodingService.geocodeLocation(
          undefined,
          city ?? undefined,
          country ?? undefined,
        );
      }
      if (!coords) return null;

      return { lat: coords.lat, lng: coords.lng, label: business_name || city || 'your area' };
    },
    enabled: !!user,
    staleTime: 1000 * 60 * 60, // 1 hour
  });

  return { center: data ?? null, isLoading };
};
