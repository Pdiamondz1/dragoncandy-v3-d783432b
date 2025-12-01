import React, { useEffect, useState, useCallback } from 'react';
import { GoogleMap, Marker, InfoWindow, useJsApiLoader } from '@react-google-maps/api';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MapPin, Loader2, AlertCircle, DollarSign, Calendar } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useCampaignGeocoding } from '@/hooks/useCampaignGeocoding';
import { geocodingService } from '@/lib/geocoding';
import {
  GOOGLE_MAPS_API_KEY,
  GOOGLE_MAPS_LIBRARIES,
  DEFAULT_MAP_CENTER,
  DEFAULT_MAP_ZOOM,
  MAP_CONTAINER_STYLE,
  MAP_OPTIONS
} from '@/lib/googleMapsConfig';

interface CampaignFilters {
  postal_code?: string;
  city?: string;
  country?: string;
}

interface Campaign {
  id: string;
  title: string;
  description?: string;
  budget_min?: number;
  budget_max?: number;
  deadline?: string;
  platforms?: string[];
  business_profile?: {
    business_name: string;
    logo_url?: string;
    postal_code?: string;
    city?: string;
    country?: string;
  };
}

interface CampaignMapViewProps {
  filteredCampaigns: Campaign[];
  filters: CampaignFilters;
  onApply?: (campaignId: string) => void;
  onViewDetails?: (campaignId: string) => void;
}

export const CampaignMapView: React.FC<CampaignMapViewProps> = ({
  filteredCampaigns,
  filters,
  onApply,
  onViewDetails
}) => {
  const navigate = useNavigate();
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [selectedCampaign, setSelectedCampaign] = useState<string | null>(null);
  const [mapCenter, setMapCenter] = useState(DEFAULT_MAP_CENTER);
  const [mapZoom, setMapZoom] = useState(DEFAULT_MAP_ZOOM);

  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    libraries: GOOGLE_MAPS_LIBRARIES
  });

  const { geocodedCampaigns, isLoading: isGeocoding } = useCampaignGeocoding(
    filteredCampaigns.slice(0, 50)
  );

  useEffect(() => {
    if (!map) return;
    
    const timeoutId = setTimeout(async () => {
      const f = {
        postal_code: filters.postal_code?.trim() || '',
        city: filters.city?.trim() || '',
        country: filters.country?.trim() || ''
      };
      
      const hasLocation = !!(f.postal_code || f.city || f.country);
      
      if (f.postal_code && f.postal_code.length < 3) return;
      if (f.city && f.city.length < 3) return;
      
      const fitAllMarkers = (points: Array<{lat: number; lng: number}>) => {
        if (points.length === 0) return;
        const bounds = new google.maps.LatLngBounds();
        points.forEach(p => bounds.extend(p));
        map.fitBounds(bounds);
        
        google.maps.event.addListenerOnce(map, 'idle', () => {
          const currentZoom = map.getZoom() ?? 12;
          const clampedZoom = Math.min(currentZoom, 12);
          const center = map.getCenter()?.toJSON() ?? DEFAULT_MAP_CENTER;
          setMapCenter(center);
          setMapZoom(clampedZoom);
          if (currentZoom > 12) map.setZoom(12);
        });
      };
      
      if (hasLocation) {
        const result = await geocodingService.geocodeLocation(f.postal_code, f.city, f.country);
        
        if (result) {
          const zoom = f.postal_code ? 12 : f.city ? 10 : 5;
          map.setCenter(result);
          map.setZoom(zoom);
          setMapCenter(result);
          setMapZoom(zoom);
          return;
        }
      }
      
      if (geocodedCampaigns.length > 0) {
        fitAllMarkers(geocodedCampaigns.map(c => ({ lat: c.lat, lng: c.lng })));
      } else {
        map.setCenter(DEFAULT_MAP_CENTER);
        map.setZoom(DEFAULT_MAP_ZOOM);
        setMapCenter(DEFAULT_MAP_CENTER);
        setMapZoom(DEFAULT_MAP_ZOOM);
      }
    }, 300);
    
    return () => clearTimeout(timeoutId);
  }, [filters, map, geocodedCampaigns]);

  const onLoad = useCallback((map: google.maps.Map) => {
    setMap(map);
  }, []);

  const onUnmount = useCallback(() => {
    setMap(null);
  }, []);

  const handleMarkerClick = (campaignId: string) => {
    setSelectedCampaign(campaignId);
  };

  if (loadError) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <AlertCircle className="h-12 w-12 text-destructive mb-4" />
          <h3 className="text-lg font-semibold mb-2">Failed to load map</h3>
          <p className="text-sm text-muted-foreground text-center">
            There was an error loading Google Maps. Please check your API key configuration.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!isLoaded) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Loader2 className="h-12 w-12 text-primary animate-spin mb-4" />
          <p className="text-sm text-muted-foreground">Loading map...</p>
        </CardContent>
      </Card>
    );
  }

  if (!GOOGLE_MAPS_API_KEY) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <MapPin className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">Map not configured</h3>
          <p className="text-sm text-muted-foreground text-center mb-4">
            Google Maps API key is required to display campaign locations.
          </p>
        </CardContent>
      </Card>
    );
  }

  const campaignsWithoutLocation = filteredCampaigns.length - geocodedCampaigns.length;

  return (
    <Card>
      <CardContent className="p-0">
        <div className="relative">
          <GoogleMap
            mapContainerStyle={MAP_CONTAINER_STYLE}
            center={mapCenter}
            zoom={mapZoom}
            onLoad={onLoad}
            onUnmount={onUnmount}
            options={MAP_OPTIONS}
          >
            {geocodedCampaigns.map(geocodedCampaign => {
              const campaign = filteredCampaigns.find(c => c.id === geocodedCampaign.id);
              if (!campaign) return null;

              return (
                <Marker
                  key={campaign.id}
                  position={{ lat: geocodedCampaign.lat, lng: geocodedCampaign.lng }}
                  onClick={() => handleMarkerClick(campaign.id)}
                  icon={{
                    url: 'https://maps.google.com/mapfiles/ms/icons/blue-dot.png',
                    scaledSize: new google.maps.Size(40, 40)
                  }}
                >
                  {selectedCampaign === campaign.id && (
                    <InfoWindow onCloseClick={() => setSelectedCampaign(null)}>
                      <div className="p-2 max-w-xs">
                        <div className="flex items-start gap-3 mb-3">
                          <Avatar className="h-12 w-12">
                            <AvatarImage src={campaign.business_profile?.logo_url} alt={campaign.business_profile?.business_name} />
                            <AvatarFallback>
                              {campaign.business_profile?.business_name?.substring(0, 2).toUpperCase() || 'BC'}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <h4 className="font-semibold">{campaign.title}</h4>
                            <p className="text-xs text-muted-foreground">
                              {campaign.business_profile?.business_name}
                            </p>
                          </div>
                        </div>
                        
                        {campaign.description && (
                          <p className="text-sm mb-3 line-clamp-2">
                            {campaign.description}
                          </p>
                        )}

                        <div className="space-y-2 mb-3">
                          {(campaign.budget_min || campaign.budget_max) && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <DollarSign className="h-3 w-3" />
                              <span>
                                ${campaign.budget_min || 0} - ${campaign.budget_max || 0}
                              </span>
                            </div>
                          )}
                          
                          {campaign.deadline && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Calendar className="h-3 w-3" />
                              <span>{new Date(campaign.deadline).toLocaleDateString()}</span>
                            </div>
                          )}
                        </div>

                        {campaign.platforms && campaign.platforms.length > 0 && (
                          <div className="flex flex-wrap gap-1 mb-3">
                            {campaign.platforms.slice(0, 3).map(platform => (
                              <Badge key={platform} variant="secondary" className="text-xs">
                                {platform}
                              </Badge>
                            ))}
                            {campaign.platforms.length > 3 && (
                              <Badge variant="outline" className="text-xs">
                                +{campaign.platforms.length - 3}
                              </Badge>
                            )}
                          </div>
                        )}

                        <div className="flex gap-2">
                          {onViewDetails && (
                            <Button 
                              size="sm" 
                              variant="outline"
                              className="flex-1"
                              onClick={() => onViewDetails(campaign.id)}
                            >
                              View
                            </Button>
                          )}
                          {onApply && (
                            <Button 
                              size="sm" 
                              className="flex-1"
                              onClick={() => onApply(campaign.id)}
                            >
                              Apply
                            </Button>
                          )}
                        </div>
                      </div>
                    </InfoWindow>
                  )}
                </Marker>
              );
            })}
          </GoogleMap>

          {isGeocoding && (
            <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-background shadow-lg rounded-lg px-4 py-2 flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span className="text-sm">Locating campaigns...</span>
            </div>
          )}

          {campaignsWithoutLocation > 0 && (
            <div className="absolute bottom-4 left-4 bg-background shadow-lg rounded-lg px-4 py-2">
              <p className="text-xs text-muted-foreground">
                <strong>{campaignsWithoutLocation}</strong> campaign{campaignsWithoutLocation !== 1 ? 's' : ''} hidden (no location data)
              </p>
            </div>
          )}

          <div className="absolute top-4 right-4 bg-background shadow-lg rounded-lg px-4 py-2">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
              <span className="text-xs">Campaign Location</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
