import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { geocodingService } from '@/lib/geocoding';

interface CampaignLocation {
  id: string;
  postal_code?: string;
  city?: string;
  country?: string;
}

interface GeocodedCampaign {
  id: string;
  lat: number;
  lng: number;
  address: string;
}

export function useCampaignGeocoding(campaigns: CampaignLocation[]) {
  const { data, isLoading } = useQuery({
    queryKey: ['campaign-geocoding', campaigns.map(c => c.id).join(',')],
    queryFn: async () => {
      const results = await geocodingService.geocodeCreators(campaigns);
      return results;
    },
    enabled: campaigns.length > 0,
    staleTime: 1000 * 60 * 60 * 24,
  });

  const geocodedCampaigns = useMemo<GeocodedCampaign[]>(() => {
    if (!data) return [];
    return campaigns.reduce<GeocodedCampaign[]>((acc, campaign) => {
      const location = data.get(campaign.id);
      if (location) acc.push({ id: campaign.id, ...location });
      return acc;
    }, []);
  }, [data, campaigns]);

  return { geocodedCampaigns, isLoading };
}
