import { haversineDistance, lookupCityCoords } from './geoUtils';

export interface LatLng {
  lat: number;
  lng: number;
}

export interface LocationCenter extends LatLng {
  label: string;
}

export type LocationMode = 'near_me' | 'custom' | 'any';

/** The location filter model owned by useCreatorBrowse and rendered by CreatorLocationControl. */
export interface LocationFilter {
  mode: LocationMode;
  /** Resolved active center (business profile or geocoded query); null while unresolved. */
  center: LocationCenter | null;
  /** Radius in miles; null means "Any" (no distance filter). */
  radiusMiles: number | null;
  /** The typed city/zip for custom mode. */
  rawQuery: string;
  /** Geocode status for the custom query. */
  status: 'idle' | 'resolving' | 'failed';
}

export const DEFAULT_LOCATION_FILTER: LocationFilter = {
  mode: 'near_me',
  center: null,
  radiusMiles: 25,
  rawQuery: '',
  status: 'idle',
};

export const RADIUS_OPTIONS: number[] = [10, 25, 50, 100];

/** A 5-digit or zip+4 string is a zip; anything else is treated as a city name. */
export function detectQueryKind(raw: string): 'zip' | 'city' {
  return /^\d{5}(-\d{4})?$/.test(raw.trim()) ? 'zip' : 'city';
}

/** Static US-city coords first (instant, free); otherwise the Google-geocoded map; else null. */
export function resolveCreatorCoords(
  creator: { id: string; city?: string; country?: string },
  geocodedById: Map<string, LatLng>,
): LatLng | null {
  const staticCoords =
    creator.city && creator.country ? lookupCityCoords(creator.city, creator.country) : null;
  if (staticCoords) return staticCoords;
  return geocodedById.get(creator.id) ?? null;
}

export interface WithDistance {
  distanceMiles?: number;
}

/**
 * Annotate creators with distanceMiles from `center`. When `center` and a finite `radiusMiles`
 * are both set, keep only creators within the radius and report how many couldn't be placed.
 * Under "Any" (radiusMiles null) or no center, keep everyone (distances annotated when placeable).
 */
export function filterByRadius<T extends { id: string; city?: string; country?: string }>(
  creators: T[],
  center: LatLng | null,
  radiusMiles: number | null,
  geocodedById: Map<string, LatLng>,
): { list: (T & WithDistance)[]; unplaceableCount: number } {
  if (!center) {
    return { list: creators.map(c => ({ ...c })), unplaceableCount: 0 };
  }

  const annotate = (c: T): T & WithDistance => {
    const coords = resolveCreatorCoords(c, geocodedById);
    return coords
      ? { ...c, distanceMiles: haversineDistance(center.lat, center.lng, coords.lat, coords.lng) }
      : { ...c };
  };

  if (radiusMiles == null) {
    return { list: creators.map(annotate), unplaceableCount: 0 };
  }

  let unplaceableCount = 0;
  const list: (T & WithDistance)[] = [];
  for (const c of creators) {
    const annotated = annotate(c);
    if (annotated.distanceMiles === undefined) {
      unplaceableCount++;
      continue;
    }
    if (annotated.distanceMiles <= radiusMiles) list.push(annotated);
  }
  return { list, unplaceableCount };
}

/** Ascending by distance; creators without a distance sort last. Non-mutating. */
export function sortNearest<T extends WithDistance>(list: T[]): T[] {
  return [...list].sort((a, b) => (a.distanceMiles ?? Infinity) - (b.distanceMiles ?? Infinity));
}
