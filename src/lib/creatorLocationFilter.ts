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

/** Precise geocoded (ZIP-based) coords first; otherwise the static US-city fallback; else null. */
export function resolveCreatorCoords(
  creator: { id: string; city?: string; country?: string },
  geocodedById: Map<string, LatLng>,
): LatLng | null {
  const geocoded = geocodedById.get(creator.id);
  if (geocoded) return geocoded;
  return creator.city && creator.country ? lookupCityCoords(creator.city, creator.country) : null;
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

/**
 * Loose "found by searching a place" test — a substring hit on city / ZIP / country / freeform
 * location. Used to SURFACE creators in the search results (parallel to name/skill matching); it is
 * intentionally broad. Distance gating for these is decided separately by `isPlaceQueryMatch`.
 */
export function matchesLocationText(
  creator: { city?: string; postal_code?: string; country?: string; location?: string },
  searchTerm: string,
): boolean {
  const t = searchTerm.trim().toLowerCase();
  if (!t) return false;
  return (
    (creator.city || '').toLowerCase().includes(t) ||
    (creator.postal_code || '').toLowerCase().includes(t) ||
    (creator.country || '').toLowerCase().includes(t) ||
    (creator.location || '').toLowerCase().includes(t)
  );
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Strict "did the user search THIS creator's specific place?" — the predicate that lets a creator
 * ESCAPE the near-me radius. Deliberately narrower than `matchesLocationText`: a whole-word match on
 * the structured `city`, or a real ZIP matching `postal_code`, min length 3. This prevents a broad
 * substring — "us" (⊂ every "US" country), "art" (⊂ "Hartford") — from silently disabling the
 * distance filter on what was really a name/skill search. Country and freeform location are excluded
 * because they embed the country name (every US creator's location contains "United States").
 */
export function isPlaceQueryMatch(
  creator: { city?: string; postal_code?: string },
  searchTerm: string,
): boolean {
  const t = searchTerm.trim().toLowerCase();
  if (t.length < 3) return false; // too short to be a specific place (e.g. "us")
  if (detectQueryKind(t) === 'zip') {
    return (creator.postal_code || '').startsWith(t.slice(0, 5));
  }
  const city = (creator.city || '').toLowerCase();
  return city ? new RegExp(`\\b${escapeRegExp(t)}\\b`).test(city) : false;
}

/**
 * The near-me distance filter, with a search-aware escape. A creator matched by a specific place
 * query (`isPlaceQueryMatch` — whole-word city or ZIP) is kept regardless of distance — the user
 * explicitly searched that location — while name / skill / bio matches (and broad substrings) stay
 * within the radius so the local-creator default holds. Distances are annotated for the Nearest sort
 * either way; under "Any" (null) nobody is dropped.
 */
export function filterByRadiusWithSearch<
  T extends { id: string; city?: string; country?: string; postal_code?: string; location?: string },
>(
  creators: T[],
  center: LatLng | null,
  radiusMiles: number | null,
  searchTerm: string,
  geocodedById: Map<string, LatLng>,
): { list: (T & WithDistance)[]; unplaceableCount: number } {
  // Annotate distances without dropping anyone, then decide inclusion per creator.
  const annotated = filterByRadius(creators, center, null, geocodedById).list;
  if (!center || radiusMiles == null) {
    return { list: annotated, unplaceableCount: 0 };
  }
  let unplaceableCount = 0;
  const list = annotated.filter(creator => {
    if (isPlaceQueryMatch(creator, searchTerm)) return true; // searched this specific place → show it
    if (creator.distanceMiles === undefined) {
      unplaceableCount++;
      return false;
    }
    return creator.distanceMiles <= radiusMiles;
  });
  return { list, unplaceableCount };
}

/** Ascending by distance; creators without a distance sort last. Non-mutating. */
export function sortNearest<T extends WithDistance>(list: T[]): T[] {
  return [...list].sort((a, b) => (a.distanceMiles ?? Infinity) - (b.distanceMiles ?? Infinity));
}