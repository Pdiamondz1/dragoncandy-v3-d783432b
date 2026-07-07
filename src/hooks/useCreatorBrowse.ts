
import React, { useMemo, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useBusinessLocationCenter } from '@/hooks/useBusinessLocationCenter';
import { useCreatorGeocoding } from '@/hooks/useCreatorGeocoding';
import { lookupCityCoords } from '@/lib/geoUtils';
import { geocodingService } from '@/lib/geocoding';
import {
  DEFAULT_LOCATION_FILTER,
  filterByRadius,
  sortNearest,
  type LocationFilter,
  type LatLng,
} from '@/lib/creatorLocationFilter';

export interface CreatorProfile {
  id: string;
  user_id: string;
  creator_name: string;
  avatar_url?: string;
  bio?: string;
  skills?: string[];
  portfolio_urls?: string[];
  location?: string;
  city?: string;
  country?: string;
  postal_code?: string;
  availability?: string;
  base_rate_per_hour?: number;
  instagram_url?: string;
  tiktok_url?: string;
  youtube_url?: string;
  facebook_url?: string;
  linkedin_url?: string;
  x_url?: string;
  other_social_url?: string;
  website_url?: string;
  average_rating?: number;
  profile_slug?: string;
  total_reviews?: number;
  distanceMiles?: number; // annotated client-side by the location filter
}

export type SortOption = 'relevance' | 'nearest' | 'top-rated' | 'price-low' | 'price-high' | 'most-reviewed';

export interface CreatorFilters {
  searchTerm: string;
  skills: string[];
  minRate: number;
  maxRate: number;
  platforms: string[];
  availability: string;
  experienceLevel: string;
  location: LocationFilter;
}

export const useCreatorBrowse = (accountType: 'restaurant' | 'brand' = 'restaurant') => {
  const { user } = useAuth();
  const [filters, setFilters] = React.useState<CreatorFilters>({
    searchTerm: '',
    skills: [],
    minRate: 0,
    maxRate: 500,
    platforms: [],
    availability: '',
    experienceLevel: '',
    location: DEFAULT_LOCATION_FILTER,
  });

  const [sortBy, setSortBy] = React.useState<SortOption>('relevance');
  const [contentTypeFilter, setContentTypeFilter] = React.useState<string[]>([]);

  const [debouncedFilters, setDebouncedFilters] = React.useState(filters);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedFilters(filters);
    }, 500);

    return () => clearTimeout(timer);
  }, [filters]);

  const { center: businessCenter } = useBusinessLocationCenter(accountType);

  // Keep the near-me center synced from the business profile.
  React.useEffect(() => {
    setFilters(prev => {
      if (prev.location.mode !== 'near_me') return prev;
      if (prev.location.center === businessCenter) return prev;
      return { ...prev, location: { ...prev.location, center: businessCenter } };
    });
  }, [businessCenter, filters.location.mode]);

  // Resolve a typed city/zip into a center (debounced) when in custom mode.
  React.useEffect(() => {
    const { mode, rawQuery } = filters.location;
    if (mode !== 'custom') return;
    const q = rawQuery.trim();
    if (q.length < 3) {
      setFilters(prev =>
        prev.location.center === null && prev.location.status === 'idle'
          ? prev
          : { ...prev, location: { ...prev.location, center: null, status: 'idle' } },
      );
      return;
    }

    let cancelled = false;
    setFilters(prev => ({ ...prev, location: { ...prev.location, status: 'resolving' } }));
    const timer = setTimeout(async () => {
      const result = await geocodingService.geocodeLocation(q);
      if (cancelled) return;
      setFilters(prev => {
        if (prev.location.mode !== 'custom') return prev;
        return result
          ? { ...prev, location: { ...prev.location, center: { lat: result.lat, lng: result.lng, label: q }, status: 'idle' } }
          : { ...prev, location: { ...prev.location, center: null, status: 'failed' } };
      });
    }, 500);

    return () => { cancelled = true; clearTimeout(timer); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.location.mode, filters.location.rawQuery]);

  const { data: creators = [], isLoading, error } = useQuery({
    queryKey: ['available-creators'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('creator_profiles')
        .select('id, user_id, creator_name, avatar_url, bio, skills, portfolio_urls, location, city, country, postal_code, availability, base_rate_per_hour, instagram_url, tiktok_url, youtube_url, facebook_url, linkedin_url, x_url, other_social_url, website_url, average_rating, profile_slug, total_reviews')
        .eq('is_completed', true)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching creators:', error);
        throw error;
      }

      return data as CreatorProfile[];
    },
    enabled: !!user,
  });

  const handleFilterChange = useCallback((key: keyof CreatorFilters, value: string | string[] | number) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  }, []);

  const updateLocation = useCallback((patch: Partial<LocationFilter>) => {
    setFilters(prev => ({ ...prev, location: { ...prev.location, ...patch } }));
    // When the user actively sets/changes location, default the sort to Nearest (reversible).
    if (patch.mode === 'custom' || patch.radiusMiles !== undefined) {
      setSortBy(prev => (prev === 'relevance' ? 'nearest' : prev));
    }
  }, []);

  const resetFilters = () => {
    setFilters({
      searchTerm: '',
      skills: [],
      minRate: 0,
      maxRate: 500,
      platforms: [],
      availability: '',
      experienceLevel: '',
      location: { ...DEFAULT_LOCATION_FILTER, center: businessCenter },
    });
    setSortBy('relevance');
    setContentTypeFilter([]);
  };

  const activeCenter: LatLng | null = filters.location.center;

  const creatorsNeedingGeocode = useMemo(() => {
    if (!activeCenter) return [];
    return creators
      .filter(c => c.postal_code || !(c.city && c.country && lookupCityCoords(c.city, c.country)))
      .map(c => ({ id: c.id, postal_code: c.postal_code, city: c.city, country: c.country }));
  }, [creators, activeCenter]);

  const { geocodedCreators } = useCreatorGeocoding(creatorsNeedingGeocode);

  const geocodedById = useMemo(
    () => new Map(geocodedCreators.map(g => [g.id, { lat: g.lat, lng: g.lng }])),
    [geocodedCreators],
  );

  const { filteredCreators, locationUnplaceableCount } = useMemo(() => {
    let result = creators.filter(creator => {
    const matchesSearch =
      (creator.creator_name || '').toLowerCase().includes(filters.searchTerm.toLowerCase()) ||
      creator.bio?.toLowerCase().includes(filters.searchTerm.toLowerCase()) ||
      creator.skills?.some(skill => skill.toLowerCase().includes(filters.searchTerm.toLowerCase()));

    const matchesSkills = filters.skills.length === 0 ||
      creator.skills?.some(skill => filters.skills.includes(skill));

    // Content-type pill filter (separate from advanced skills filter)
    const matchesContentType = contentTypeFilter.length === 0 ||
      creator.skills?.some(skill => contentTypeFilter.includes(skill));

    const matchesRate = (() => {
      const rate = creator.base_rate_per_hour || 0;
      return rate >= filters.minRate && rate <= filters.maxRate;
    })();

    const matchesPlatforms = filters.platforms.length === 0 || (() => {
      const creatorPlatforms: string[] = [];
      if (creator.instagram_url) creatorPlatforms.push('Instagram');
      if (creator.tiktok_url) creatorPlatforms.push('TikTok');
      if (creator.youtube_url) creatorPlatforms.push('YouTube');
      if (creator.facebook_url) creatorPlatforms.push('Facebook');
      if (creator.linkedin_url) creatorPlatforms.push('LinkedIn');
      if (creator.x_url) creatorPlatforms.push('X (Twitter)');

      return filters.platforms.some(platform => creatorPlatforms.includes(platform));
    })();

    const matchesAvailability = !filters.availability || filters.availability === "any" ||
      creator.availability === filters.availability;

    const matchesExperience = !filters.experienceLevel || filters.experienceLevel === "any";

      return matchesSearch && matchesSkills && matchesContentType &&
             matchesRate && matchesPlatforms && matchesAvailability && matchesExperience;
    });

    // Location radius filter
    let unplaceable = 0;
    if (activeCenter) {
      const { list, unplaceableCount } = filterByRadius(
        result,
        activeCenter,
        filters.location.radiusMiles,
        geocodedById,
      );
      result = list;
      unplaceable = unplaceableCount;
    }

    // Sort
    if (sortBy === 'nearest') {
      result = sortNearest(result);
    } else if (sortBy !== 'relevance') {
      result = [...result].sort((a, b) => {
        switch (sortBy) {
          case 'top-rated':
            return (b.average_rating ?? -1) - (a.average_rating ?? -1);
          case 'price-low':
            return (a.base_rate_per_hour ?? Infinity) - (b.base_rate_per_hour ?? Infinity);
          case 'price-high':
            return (b.base_rate_per_hour ?? -Infinity) - (a.base_rate_per_hour ?? -Infinity);
          case 'most-reviewed':
            return (b.total_reviews ?? -1) - (a.total_reviews ?? -1);
          default:
            return 0;
        }
      });
    }

    return { filteredCreators: result, locationUnplaceableCount: unplaceable };
  }, [creators, filters, sortBy, contentTypeFilter, activeCenter, geocodedById]);

  return {
    creators,
    filteredCreators,
    filters,
    debouncedFilters,
    isLoading,
    error,
    handleFilterChange,
    resetFilters,
    sortBy,
    setSortBy,
    contentTypeFilter,
    setContentTypeFilter,
    location: filters.location,
    updateLocation,
    locationUnplaceableCount,
    hasBusinessLocation: businessCenter != null,
  };
};
