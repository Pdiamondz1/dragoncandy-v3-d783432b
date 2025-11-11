export const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

export const GOOGLE_MAPS_LIBRARIES: ("places" | "geometry")[] = ["places"];

export const DEFAULT_MAP_CENTER = {
  lat: 20,
  lng: 0
};

export const DEFAULT_MAP_ZOOM = 2;

export const MAP_CONTAINER_STYLE = {
  width: '100%',
  height: '600px'
};

export const MAP_OPTIONS: google.maps.MapOptions = {
  disableDefaultUI: false,
  zoomControl: true,
  mapTypeControl: false,
  streetViewControl: false,
  fullscreenControl: true,
  styles: [
    {
      featureType: "poi",
      elementType: "labels",
      stylers: [{ visibility: "off" }]
    }
  ]
};
