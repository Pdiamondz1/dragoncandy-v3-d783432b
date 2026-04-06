import { useMemo } from 'react';
import type { PublicCampaign } from '@/hooks/usePublicCampaigns';
import { useCreatorMatchProfile } from '@/hooks/useCreatorMatchProfile';
import { lookupCityCoords, haversineDistance } from '@/lib/geoUtils';

export interface GeoEnrichedCampaign extends PublicCampaign {
  distanceMiles: number | null;
}

export interface GeoDistanceResult {
  campaigns: GeoEnrichedCampaign[];
  creatorHasCoords: boolean;
}

export const useGeoDistance = (campaigns: PublicCampaign[]): GeoDistanceResult => {
  const { data: profile } = useCreatorMatchProfile();

  return useMemo(() => {
    const creatorCoords = profile?.city && profile?.country
      ? lookupCityCoords(profile.city, profile.country)
      : null;

    const enriched: GeoEnrichedCampaign[] = campaigns.map((campaign) => {
      if (!creatorCoords) {
        return { ...campaign, distanceMiles: null };
      }

      const businessCity = campaign.business_profile?.city;
      const businessCountry = campaign.business_profile?.country;

      if (!businessCity || !businessCountry) {
        return { ...campaign, distanceMiles: null };
      }

      const businessCoords = lookupCityCoords(businessCity, businessCountry);
      if (!businessCoords) {
        return { ...campaign, distanceMiles: null };
      }

      const distance = haversineDistance(
        creatorCoords.lat, creatorCoords.lng,
        businessCoords.lat, businessCoords.lng,
      );

      return { ...campaign, distanceMiles: distance };
    });

    return {
      campaigns: enriched,
      creatorHasCoords: creatorCoords !== null,
    };
  }, [profile?.city, profile?.country, campaigns]);
};
