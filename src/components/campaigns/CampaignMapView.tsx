import React, { useState, useMemo, useEffect } from 'react';
import { GoogleMap, useLoadScript, Marker, InfoWindow } from '@react-google-maps/api';
import { GOOGLE_MAPS_API_KEY, GOOGLE_MAPS_LIBRARIES, DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM, MAP_CONTAINER_STYLE, MAP_OPTIONS } from '@/lib/googleMapsConfig';
import { useCampaignGeocoding } from '@/hooks/useCampaignGeocoding';
import { PublicCampaign } from '@/hooks/usePublicCampaigns';
import { SponsorshipCampaign } from '@/hooks/useSponsorshipCampaigns';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { MapPin, DollarSign } from 'lucide-react';

interface CampaignMapViewProps {
  campaigns: (PublicCampaign | SponsorshipCampaign)[];
  onViewDetails: (campaignId: string) => void;
}

const CampaignMapView: React.FC<CampaignMapViewProps> = ({ campaigns, onViewDetails }) => {
  const { isLoaded, loadError } = useLoadScript({
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    libraries: GOOGLE_MAPS_LIBRARIES,
  });

  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [debouncedCampaigns, setDebouncedCampaigns] = useState(campaigns);

  // Debounce campaigns updates to prevent excessive re-geocoding
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedCampaigns(campaigns);
    }, 300);

    return () => clearTimeout(timer);
  }, [campaigns]);

  const campaignsWithLocation = useMemo(() => {
    return debouncedCampaigns
      .filter(c => c.business_profile?.postal_code || c.business_profile?.city)
      .map(c => ({
        id: c.id,
        postal_code: c.business_profile?.postal_code,
        city: c.business_profile?.city,
        country: c.business_profile?.country,
      }));
  }, [debouncedCampaigns]);

  const { geocodedCampaigns, isLoading: isGeocoding } = useCampaignGeocoding(campaignsWithLocation);

  const selectedCampaign = useMemo(() => {
    return campaigns.find(c => c.id === selectedCampaignId);
  }, [selectedCampaignId, campaigns]);

  if (loadError) {
    return (
      <div className="flex items-center justify-center h-[600px] bg-muted rounded-lg">
        <div className="text-center space-y-2">
          <MapPin className="h-12 w-12 mx-auto text-muted-foreground" aria-hidden="true" />
          <p className="text-muted-foreground">Error loading maps</p>
        </div>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center h-[600px] bg-muted rounded-lg">
        <div className="text-center space-y-2">
          <MapPin className="h-12 w-12 mx-auto text-muted-foreground animate-pulse" aria-hidden="true" />
          <p className="text-muted-foreground">Loading map…</p>
        </div>
      </div>
    );
  }

  const campaignsWithoutLocation = campaigns.length - geocodedCampaigns.length;

  return (
    <div className="space-y-4">
      {isGeocoding && (
        <div className="text-sm text-muted-foreground">
          Geocoding campaign locations…
        </div>
      )}
      
      {campaignsWithoutLocation > 0 && (
        <div className="text-sm text-muted-foreground">
          {campaignsWithoutLocation} campaign{campaignsWithoutLocation !== 1 ? 's' : ''} without location data
        </div>
      )}

      <GoogleMap
        mapContainerStyle={MAP_CONTAINER_STYLE}
        center={geocodedCampaigns.length > 0 ? {
          lat: geocodedCampaigns[0].lat,
          lng: geocodedCampaigns[0].lng
        } : DEFAULT_MAP_CENTER}
        zoom={geocodedCampaigns.length > 0 ? 10 : DEFAULT_MAP_ZOOM}
        options={MAP_OPTIONS}
      >
        {geocodedCampaigns.map((geocoded) => {
          const campaign = campaigns.find(c => c.id === geocoded.id);
          if (!campaign) return null;

          return (
            <Marker
              key={geocoded.id}
              position={{ lat: geocoded.lat, lng: geocoded.lng }}
              onClick={() => setSelectedCampaignId(geocoded.id)}
              icon={{
                url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
                  <svg xmlns="http://www.w3.org/2000/svg" width="32" height="40" viewBox="0 0 32 40">
                    <path fill="#FF6B9D" d="M16,0 C7.163,0 0,7.163 0,16 C0,24.837 16,40 16,40 C16,40 32,24.837 32,16 C32,7.163 24.837,0 16,0 Z"/>
                    <circle cx="16" cy="16" r="8" fill="white"/>
                  </svg>
                `),
                scaledSize: new google.maps.Size(32, 40),
                anchor: new google.maps.Point(16, 40),
              }}
            />
          );
        })}

        {selectedCampaign && selectedCampaignId && (
          <InfoWindow
            position={geocodedCampaigns.find(g => g.id === selectedCampaignId) 
              ? { 
                  lat: geocodedCampaigns.find(g => g.id === selectedCampaignId)!.lat, 
                  lng: geocodedCampaigns.find(g => g.id === selectedCampaignId)!.lng 
                }
              : DEFAULT_MAP_CENTER
            }
            onCloseClick={() => setSelectedCampaignId(null)}
          >
            <Card className="border-0 shadow-none p-3 min-w-[280px]">
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <Avatar className="h-12 w-12">
                    <AvatarImage src={selectedCampaign.business_profile?.logo_url} alt={selectedCampaign.business_profile?.business_name || 'Business logo'} />
                    <AvatarFallback>
                      {selectedCampaign.business_profile?.business_name?.charAt(0) || 'B'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-muted-foreground">
                      {selectedCampaign.business_profile?.business_name}
                    </p>
                    <h3 className="font-semibold text-base line-clamp-2">
                      {selectedCampaign.title}
                    </h3>
                  </div>
                </div>

                {(selectedCampaign.budget_min || selectedCampaign.budget_max) && (
                  <div className="flex items-center gap-2 text-sm">
                    <DollarSign className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    <span>
                      {selectedCampaign.budget_min && selectedCampaign.budget_max
                        ? `$${selectedCampaign.budget_min.toLocaleString()} - $${selectedCampaign.budget_max.toLocaleString()}`
                        : selectedCampaign.budget_max
                        ? `Up to $${selectedCampaign.budget_max.toLocaleString()}`
                        : `From $${selectedCampaign.budget_min?.toLocaleString()}`}
                    </span>
                  </div>
                )}

                {selectedCampaign.platforms && selectedCampaign.platforms.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {selectedCampaign.platforms.slice(0, 3).map((platform) => (
                      <Badge key={platform} variant="secondary" className="text-xs">
                        {platform}
                      </Badge>
                    ))}
                    {selectedCampaign.platforms.length > 3 && (
                      <Badge variant="secondary" className="text-xs">
                        +{selectedCampaign.platforms.length - 3}
                      </Badge>
                    )}
                  </div>
                )}

                <Button
                  onClick={() => onViewDetails(selectedCampaign.id)}
                  className="w-full"
                  size="sm"
                >
                  View Details
                </Button>
              </div>
            </Card>
          </InfoWindow>
        )}
      </GoogleMap>
    </div>
  );
};

export default CampaignMapView;
