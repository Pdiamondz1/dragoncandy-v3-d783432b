import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { geocodingService } from '@/lib/geocoding';

interface CreatorLocation {
  id: string;
  postal_code?: string;
  city?: string;
  country?: string;
}

interface GeocodedCreator {
  id: string;
  lat: number;
  lng: number;
  address: string;
}

export function useCreatorGeocoding(creators: CreatorLocation[]) {
  const [geocodedCreators, setGeocodedCreators] = useState<GeocodedCreator[]>([]);

  const { data, isLoading } = useQuery({
    queryKey: ['creator-geocoding', creators.map(c => c.id).join(',')],
    queryFn: async () => {
      const results = await geocodingService.geocodeCreators(creators);
      return results;
    },
    enabled: creators.length > 0,
    staleTime: 1000 * 60 * 60 * 24,
  });

  useEffect(() => {
    if (data) {
      const geocoded: GeocodedCreator[] = [];
      creators.forEach(creator => {
        const location = data.get(creator.id);
        if (location) {
          geocoded.push({
            id: creator.id,
            ...location
          });
        }
      });
      setGeocodedCreators(geocoded);
    }
  }, [data, creators]);

  return { geocodedCreators, isLoading };
}
