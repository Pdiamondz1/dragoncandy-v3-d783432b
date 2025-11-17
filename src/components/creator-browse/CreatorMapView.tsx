import React, { useEffect, useState, useCallback } from 'react';
import { GoogleMap, Marker, InfoWindow, useJsApiLoader } from '@react-google-maps/api';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MapPin, Loader2, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useCreatorGeocoding } from '@/hooks/useCreatorGeocoding';
import { geocodingService } from '@/lib/geocoding';
import type { CreatorFilters } from '@/hooks/useCreatorBrowse';
import {
  GOOGLE_MAPS_API_KEY,
  GOOGLE_MAPS_LIBRARIES,
  DEFAULT_MAP_CENTER,
  DEFAULT_MAP_ZOOM,
  MAP_CONTAINER_STYLE,
  MAP_OPTIONS
} from '@/lib/googleMapsConfig';

interface CreatorProfile {
  id: string;
  user_id: string;
  creator_name: string;
  avatar_url?: string;
  bio?: string;
  city?: string;
  country?: string;
  postal_code?: string;
  skills?: string[];
  base_rate_per_hour?: number;
}

interface CreatorMapViewProps {
  filteredCreators: CreatorProfile[];
  filters: CreatorFilters;
}

export const CreatorMapView: React.FC<CreatorMapViewProps> = ({
  filteredCreators,
  filters
}) => {
  const navigate = useNavigate();
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [selectedCreator, setSelectedCreator] = useState<string | null>(null);
  const [mapCenter, setMapCenter] = useState(DEFAULT_MAP_CENTER);
  const [mapZoom, setMapZoom] = useState(DEFAULT_MAP_ZOOM);

  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    libraries: GOOGLE_MAPS_LIBRARIES
  });

  const { geocodedCreators, isLoading: isGeocoding } = useCreatorGeocoding(
    filteredCreators.slice(0, 50).map(c => ({
      id: c.id,
      postal_code: c.postal_code,
      city: c.city,
      country: c.country
    }))
  );

  useEffect(() => {
    if (!map) return;
    
    // Debounce map updates to prevent freezing during typing
    const timeoutId = setTimeout(async () => {
      // Sanitize filter inputs
      const f = {
        postal_code: filters.postal_code?.trim() || '',
        city: filters.city?.trim() || '',
        country: filters.country?.trim() || ''
      };
      
      const hasLocation = !!(f.postal_code || f.city || f.country);
      
      // Guard against very short inputs
      if (f.postal_code && f.postal_code.length < 3) return;
      if (f.city && f.city.length < 3) return;
      
      // Helper function to fit bounds to all markers
      const fitAllMarkers = (points: Array<{lat: number; lng: number}>) => {
        const bounds = new google.maps.LatLngBounds();
        points.forEach(p => bounds.extend(p));
        map.fitBounds(bounds);
        
        // Clamp zoom so it doesn't get too close
        google.maps.event.addListenerOnce(map, 'idle', () => {
          const currentZoom = map.getZoom();
          if (currentZoom && currentZoom > 12) {
            map.setZoom(12);
          }
        });
      };
      
      // Case 1: Multiple geocoded creators - fit bounds to show all
      if (geocodedCreators.length > 1) {
        fitAllMarkers(geocodedCreators.map(c => ({ lat: c.lat, lng: c.lng })));
        return;
      }
      
      // Case 2: Single geocoded creator - zoom to appropriate level
      if (geocodedCreators.length === 1) {
        const { lat, lng } = geocodedCreators[0];
        const center = { lat, lng };
        map.panTo(center);
        
        let newZoom = 8;
        if (f.postal_code) newZoom = 12;
        else if (f.city) newZoom = 10;
        else if (f.country) newZoom = 5;
        
        setMapZoom(newZoom);
        map.setZoom(newZoom);
        return;
      }
      
      // Case 3: User entered location but no markers yet - geocode and center
      if (hasLocation) {
        const result = await geocodingService.geocodeLocation(
          f.postal_code,
          f.city,
          f.country
        );
        
        if (result) {
          const center = { lat: result.lat, lng: result.lng };
          map.panTo(center);
          
          let newZoom = 8;
          if (f.postal_code) newZoom = 12;
          else if (f.city) newZoom = 10;
          else if (f.country) newZoom = 5;
          
          setMapCenter(center);
          setMapZoom(newZoom);
          map.setZoom(newZoom);
        }
        return;
      }
      
      // Case 4: No filters but we have markers - fit all markers
      if (geocodedCreators.length > 0) {
        fitAllMarkers(geocodedCreators.map(c => ({ lat: c.lat, lng: c.lng })));
      }
    }, 450); // 450ms debounce
    
    return () => clearTimeout(timeoutId);
  }, [filters, map, geocodedCreators]);

  const onLoad = useCallback((map: google.maps.Map) => {
    setMap(map);
  }, []);

  const onUnmount = useCallback(() => {
    setMap(null);
  }, []);

  const handleMarkerClick = (creatorId: string) => {
    setSelectedCreator(creatorId);
  };

  const handleViewProfile = (creatorId: string) => {
    navigate(`/profile/creator/${creatorId}`);
  };

  if (loadError) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <AlertCircle className="h-12 w-12 text-destructive mb-4" />
          <h3 className="text-lg font-semibold mb-2">
            Failed to load map
          </h3>
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
          <h3 className="text-lg font-semibold mb-2">
            Map not configured
          </h3>
          <p className="text-sm text-muted-foreground text-center mb-4">
            Google Maps API key is required to display creator locations.
          </p>
          <Button variant="outline" size="sm" onClick={() => window.open('https://console.cloud.google.com/', '_blank')}>
            Get API Key
          </Button>
        </CardContent>
      </Card>
    );
  }

  const creatorsWithoutLocation = filteredCreators.length - geocodedCreators.length;

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
            {geocodedCreators.map(geocodedCreator => {
              const creator = filteredCreators.find(c => c.id === geocodedCreator.id);
              if (!creator) return null;

              return (
                <Marker
                  key={creator.id}
                  position={{ lat: geocodedCreator.lat, lng: geocodedCreator.lng }}
                  onClick={() => handleMarkerClick(creator.id)}
                  icon={{
                    url: 'https://maps.google.com/mapfiles/ms/icons/red-dot.png',
                    scaledSize: new google.maps.Size(40, 40)
                  }}
                >
                  {selectedCreator === creator.id && (
                    <InfoWindow onCloseClick={() => setSelectedCreator(null)}>
                      <div className="p-2 max-w-xs">
                        <div className="flex items-start gap-3 mb-3">
                          <Avatar className="h-12 w-12">
                            <AvatarImage src={creator.avatar_url} alt={creator.creator_name} />
                            <AvatarFallback>
                              {creator.creator_name.substring(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <h4 className="font-semibold">{creator.creator_name}</h4>
                            {creator.city && creator.country && (
                              <p className="text-xs text-muted-foreground flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                {creator.city}, {creator.country}
                              </p>
                            )}
                          </div>
                        </div>
                        
                        {creator.bio && (
                          <p className="text-sm mb-3 line-clamp-2">
                            {creator.bio}
                          </p>
                        )}

                        {creator.skills && creator.skills.length > 0 && (
                          <div className="flex flex-wrap gap-1 mb-3">
                            {creator.skills.slice(0, 3).map(skill => (
                              <Badge key={skill} variant="secondary" className="text-xs">
                                {skill}
                              </Badge>
                            ))}
                            {creator.skills.length > 3 && (
                              <Badge variant="outline" className="text-xs">
                                +{creator.skills.length - 3}
                              </Badge>
                            )}
                          </div>
                        )}

                        {creator.base_rate_per_hour && (
                          <p className="text-sm mb-3">
                            <strong>${creator.base_rate_per_hour}/hr</strong>
                          </p>
                        )}

                        <Button 
                          size="sm" 
                          className="w-full"
                          onClick={() => handleViewProfile(creator.id)}
                        >
                          View Profile
                        </Button>
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
              <span className="text-sm">Locating creators...</span>
            </div>
          )}

          {creatorsWithoutLocation > 0 && (
            <div className="absolute bottom-4 left-4 bg-background shadow-lg rounded-lg px-4 py-2">
              <p className="text-xs text-muted-foreground">
                <strong>{creatorsWithoutLocation}</strong> creator{creatorsWithoutLocation !== 1 ? 's' : ''} hidden (no location data)
              </p>
            </div>
          )}

          <div className="absolute top-4 right-4 bg-background shadow-lg rounded-lg px-4 py-2">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-red-500 rounded-full"></div>
              <span className="text-xs">Creator Location</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
