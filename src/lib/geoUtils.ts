import { US_CITY_COORDS } from './usCityCoords';

const EARTH_RADIUS_MILES = 3958.8;

export function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(EARTH_RADIUS_MILES * c * 10) / 10;
}

const US_COUNTRY_VARIANTS = new Set([
  'us', 'usa', 'united states', 'united states of america',
]);

function normalizeCountry(country: string): string {
  return country.toLowerCase().trim().replace(/\./g, '');
}

function isUSCountry(country: string): boolean {
  return US_COUNTRY_VARIANTS.has(normalizeCountry(country));
}

export function lookupCityCoords(
  city: string,
  country: string,
): { lat: number; lng: number } | null {
  if (!city || !country) return null;
  if (!isUSCountry(country)) return null;

  const normalized = city.toLowerCase().trim();
  const coords = US_CITY_COORDS[normalized];
  return coords ?? null;
}
