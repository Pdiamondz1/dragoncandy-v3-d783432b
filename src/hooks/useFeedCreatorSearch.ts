import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { geocodingService } from '@/lib/geocoding';
import { useCreatorGeocoding } from '@/hooks/useCreatorGeocoding';
import { type LatLng } from '@/lib/creatorLocationFilter';
import { filterCreatorsByRadius, type FeedCreator } from '@/lib/feedCreators';

export interface FeedCreatorSearch {
  results: FeedCreator[];
  status: 'idle' | 'resolving' | 'failed'; // geocoding status of the typed location (zip or city)
  locationActive: boolean;                  // a resolved center is localizing the list
}

/**
 * Controlled creator search over the feed's creators. Name filter is global (any location); an
 * optional location query (ZIP or city name, ≥3 chars) is geocoded to a center and used to narrow
 * the list by radius. Geocoding is lazy — nothing hits the network until a ≥3-char location resolves
 * a center, and creators are only geocoded under a finite radius (never under "Any").
 */
export function useFeedCreatorSearch(
  creators: FeedCreator[],
  searchTerm: string,
  locationQuery: string,
  radiusMiles: number | null,
): FeedCreatorSearch {
  // 1) Name filter — global, first. No location restriction.
  const named = useMemo(() => {
    const t = searchTerm.trim().toLowerCase();
    if (!t) return creators;
    return creators.filter(c => c.creatorName.toLowerCase().includes(t));
  }, [creators, searchTerm]);

  // 2) Debounce the location query (~400ms) so we don't geocode every keystroke.
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(locationQuery.trim()), 400);
    return () => clearTimeout(timer);
  }, [locationQuery]);

  // A location query needs ≥3 chars to be a real place (ZIP or city) — NOT zip-only (D10).
  const validQuery = debounced.length >= 3;

  // 3) Geocode the typed location → center. geocodeLocation resolves a ZIP or a city string
  //    (single first arg = the place query), cached 24h and keyed on the debounced value.
  const { data: center, isLoading: centerLoading } = useQuery({
    queryKey: ['feed-location-center', debounced],
    queryFn: async (): Promise<LatLng | null> => {
      const r = await geocodingService.geocodeLocation(debounced);
      return r ? { lat: r.lat, lng: r.lng } : null;
    },
    enabled: validQuery,
    staleTime: 1000 * 60 * 60 * 24,
  });

  const hasCenter = validQuery && !!center;

  // 4) Unique creators to geocode — mirror useCreatorBrowse: a creator with only a freeform
  //    `location` passes that string as postal_code so it still geocodes (and is placeable).
  const uniqueCreators = useMemo(() => {
    const map = new Map<string, { id: string; postal_code?: string; city?: string; country?: string }>();
    for (const c of named) {
      if (!map.has(c.creatorId)) {
        map.set(c.creatorId, {
          id: c.creatorId,
          postal_code: c.postalCode || (!c.city && !c.country ? c.location : undefined),
          city: c.city,
          country: c.country,
        });
      }
    }
    return [...map.values()];
  }, [named]);

  // Lazy: geocode creators only when a center is active AND a finite radius is set. Under "Any"
  // (radiusMiles null) filterByRadius keeps everyone regardless of coords, so geocoding would be
  // wasted Google-quota work. Pass [] to idle useCreatorGeocoding.
  const creatorsToGeocode = hasCenter && radiusMiles != null ? uniqueCreators : [];
  const { geocodedCreators, isLoading: geocodingLoading } = useCreatorGeocoding(creatorsToGeocode);

  const geocodedById = useMemo(
    () => new Map<string, LatLng>(geocodedCreators.map(g => [g.id, { lat: g.lat, lng: g.lng }])),
    [geocodedCreators],
  );

  // 5) Narrow by radius. No center → global (unfiltered). Center but creators still geocoding →
  //    don't transiently drop (pass null center). Else run the pure filter.
  const results = useMemo(
    () =>
      filterCreatorsByRadius(
        named,
        hasCenter && !geocodingLoading ? center ?? null : null,
        radiusMiles,
        geocodedById,
      ),
    [named, hasCenter, geocodingLoading, center, radiusMiles, geocodedById],
  );

  const status: FeedCreatorSearch['status'] = !validQuery
    ? 'idle'
    : centerLoading
      ? 'resolving'
      : !center
        ? 'failed'
        : geocodingLoading
          ? 'resolving'
          : 'idle';

  return { results, status, locationActive: hasCenter };
}
