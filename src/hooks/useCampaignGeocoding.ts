import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { geocodingService } from '@/lib/geocoding';

interface CampaignLocation {
  id: string;
  business_profile?: {
    postal_code?: string;
    city?: string;
    country?: string;
  };
}

interface GeocodedCampaign {
  id: string;
  lat: number;
  lng: number;
  address: string;
}

export function useCampaignGeocoding(campaigns: CampaignLocation[]) {
  const [geocodedCampaigns, setGeocodedCampaigns] = useState<GeocodedCampaign[]>([]);

  const { data, isLoading } = useQuery({
    queryKey: ['campaign-geocoding', campaigns.map(c => c.id).join(',')],
    queryFn: async () => {
      const results = await geocodingService.geocodeCreators(
        campaigns.map(c => ({
          id: c.id,
          postal_code: c.business_profile?.postal_code,
          city: c.business_profile?.city,
          country: c.business_profile?.country,
        }))
      );
      return results;
    },
    enabled: campaigns.length > 0,
    staleTime: 1000 * 60 * 60 * 24,
  });

  useEffect(() => {
    if (data) {
      const geocoded: GeocodedCampaign[] = [];
      campaigns.forEach(campaign => {
        const location = data.get(campaign.id);
        if (location) {
          geocoded.push({
            id: campaign.id,
            ...location
          });
        }
      });
      setGeocodedCampaigns(geocoded);
    }
  }, [data, campaigns]);

  return { geocodedCampaigns, isLoading };
}
