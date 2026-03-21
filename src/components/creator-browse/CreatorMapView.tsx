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
    
    // Debounce map updates to prevent lag during typing
    const timeoutId = setTimeout(async () => {
      const f = {
        postal_code: filters.postal_code?.trim() || '',
        city: filters.city?.trim() || '',
        country: filters.country?.trim() || ''
      };
      
      const hasLocation = !!(f.postal_code || f.city || f.country);
      console.log('[Map] Debounced update', { filters: f, hasLocation, geocodedCount: geocodedCreators.length });
      
      // Guard against very short inputs
      if (f.postal_code && f.postal_code.length < 3) return;
      if (f.city && f.city.length < 3) return;
      
      // Helper to fit all markers
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
      
      // If location filters are active, geocode and center
      if (hasLocation) {
        console.log('[Map] Geocoding location filter', f);
        const result = await geocodingService.geocodeLocation(f.postal_code, f.city, f.country);
        
        if (result) {
          console.log('[Map] Geocoded location', result);
          const zoom = f.postal_code ? 12 : f.city ? 10 : 5;
          map.setCenter(result);
          map.setZoom(zoom);
          setMapCenter(result);
          setMapZoom(zoom);
          return;
        }
      }
      
      // Otherwise fit all geocoded creators
      if (geocodedCreators.length > 0) {
        console.log('[Map] Fitting all creators', geocodedCreators.length);
        fitAllMarkers(geocodedCreators.map(c => ({ lat: c.lat, lng: c.lng })));
      } else {
        console.log('[Map] No creators, reset to default');
        map.setCenter(DEFAULT_MAP_CENTER);
        map.setZoom(DEFAULT_MAP_ZOOM);
        setMapCenter(DEFAULT_MAP_CENTER);
        setMapZoom(DEFAULT_MAP_ZOOM);
      }
    }, 300); // 300ms debounce
    
    return () => clearTimeout(timeoutId);
  }, [filters, map]);

  const onLoad = useCallback((map: google.maps.Map) => {
    console.log('🗺️ [Map] Google Map loaded successfully', { mapObject: !!map });
    setMap(map);
  }, []);

  const onUnmount = useCallback(() => {
    console.log('🗺️ [Map] Google Map unmounting, clearing state');
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
