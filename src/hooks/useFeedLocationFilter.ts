import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { geocodingService } from '@/lib/geocoding';
import { useCreatorGeocoding } from '@/hooks/useCreatorGeocoding';
import {
  detectQueryKind,
  filterMediaByRadius,
  DEFAULT_LOCATION_FILTER,
  type LatLng,
} from '@/lib/creatorLocationFilter';
import type { PortfolioMedia } from '@/hooks/useUniqueCreatorPortfolio';

export interface FeedLocationFilter {
  zip: string;
  setZip: (z: string) => void;
  radiusMiles: number | null; // null = "Any"
  setRadiusMiles: (r: number | null) => void;
  filteredMedia: PortfolioMedia[];
  status: 'idle' | 'resolving' | 'failed';
  active: boolean; // a usable center is resolved
}

/**
 * Zip-radius filter for the Dragon Feed. Takes the (already name/type-filtered) media and returns
 * it narrowed to creators within `radiusMiles` of the typed zip. Geocoding is lazy — nothing hits
 * the network until a valid zip resolves a center.
 */
export function useFeedLocationFilter(media: PortfolioMedia[]): FeedLocationFilter {
  const [zip, setZip] = useState('');
  const [radiusMiles, setRadiusMiles] = useState<number | null>(
    DEFAULT_LOCATION_FILTER.radiusMiles,
  );

  // Debounce the raw zip (~400ms) so we don't geocode every keystroke.
  const [debouncedZip, setDebouncedZip] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedZip(zip.trim()), 400);
    return () => clearTimeout(t);
  }, [zip]);

  const isValidZip = detectQueryKind(debouncedZip) === 'zip';

  // Geocode the typed zip -> center. geocodeLocation(postal_code?, city?, country?): the zip is the
  // sole first argument, so it is treated as the postal_code.
  const { data: center, isLoading: centerLoading } = useQuery({
    queryKey: ['feed-zip-center', debouncedZip],
    queryFn: async (): Promise<LatLng | null> => {
      const r = await geocodingService.geocodeLocation(debouncedZip);
      return r ? { lat: r.lat, lng: r.lng } : null;
    },
    enabled: isValidZip,
    staleTime: 1000 * 60 * 60 * 24,
  });

  const active = isValidZip && !!center;

  // Unique creators for geocoding — keep postal_code (useCreatorGeocoding needs it), and mirror
  // useCreatorBrowse: a creator with only a freeform `location` passes that string as postal_code
  // so it still geocodes (and becomes placeable) rather than being dropped.
  const uniqueCreators = useMemo(() => {
    const map = new Map<
      string,
      { id: string; postal_code?: string; city?: string; country?: string }
    >();
    for (const m of media) {
      if (!map.has(m.creatorId)) {
        map.set(m.creatorId, {
          id: m.creatorId,
          postal_code: m.postalCode || (!m.city && !m.country ? m.location : undefined),
          city: m.city,
          country: m.country,
        });
      }
    }
    return [...map.values()];
  }, [media]);

  // Lazy: geocode creators only when a zip center is active AND a finite radius is set. Under "Any"
  // (radiusMiles null) filterByRadius keeps every creator regardless of coords, so geocoding would
  // be wasted Google-quota work that only stalls the feed. Pass [] to idle useCreatorGeocoding.
  const creatorsToGeocode = active && radiusMiles != null ? uniqueCreators : [];
  const { geocodedCreators, isLoading: geocodingLoading } = useCreatorGeocoding(creatorsToGeocode);

  const geocodedById = useMemo(
    () => new Map<string, LatLng>(geocodedCreators.map(g => [g.id, { lat: g.lat, lng: g.lng }])),
    [geocodedCreators],
  );

  const filteredMedia = useMemo(
    () =>
      filterMediaByRadius(
        media,
        active && !geocodingLoading ? center ?? null : null,
        radiusMiles,
        geocodedById,
      ),
    [media, active, geocodingLoading, center, radiusMiles, geocodedById],
  );

  const status: FeedLocationFilter['status'] = !isValidZip
    ? 'idle'
    : centerLoading
      ? 'resolving'
      : !center
        ? 'failed'
        : geocodingLoading
          ? 'resolving'
          : 'idle';

  return { zip, setZip, radiusMiles, setRadiusMiles, filteredMedia, status, active };
}
