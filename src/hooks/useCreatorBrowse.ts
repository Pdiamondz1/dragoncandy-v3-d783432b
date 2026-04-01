
import React, { useMemo, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

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
}

export type SortOption = 'relevance' | 'top-rated' | 'price-low' | 'price-high' | 'most-reviewed';

export interface CreatorFilters {
  searchTerm: string;
  skills: string[];
  city: string;
  country: string;
  postal_code: string;
  minRate: number;
  maxRate: number;
  platforms: string[];
  availability: string;
  experienceLevel: string;
  _isLocationAutoFilled?: boolean; // Internal flag to track if city/country came from postal auto-fill
}

export const useCreatorBrowse = () => {
  const { user } = useAuth();
  const [filters, setFilters] = React.useState<CreatorFilters>({
    searchTerm: '',
    skills: [],
    city: '',
    country: '',
    postal_code: '',
    minRate: 0,
    maxRate: 500,
    platforms: [],
    availability: '',
    experienceLevel: '',
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

  const { data: creators = [], isLoading, error } = useQuery({
    queryKey: ['available-creators'],
    queryFn: async () => {
      console.log('Fetching available creators');
      const { data, error } = await supabase
        .from('creator_profiles')
        .select('id, user_id, creator_name, avatar_url, bio, skills, portfolio_urls, location, city, country, postal_code, availability, base_rate_per_hour, instagram_url, tiktok_url, youtube_url, facebook_url, linkedin_url, x_url, other_social_url, website_url, average_rating, profile_slug, total_reviews')
        .eq('is_completed', true)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching creators:', error);
        throw error;
      }

      console.log('Fetched creators:', data);
      return data as CreatorProfile[];
    },
    enabled: !!user,
  });

  const handleFilterChange = useCallback((key: keyof CreatorFilters, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  }, []);

  const resetFilters = () => {
    setFilters({
      searchTerm: '',
      skills: [],
      city: '',
      country: '',
      postal_code: '',
      minRate: 0,
      maxRate: 500,
      platforms: [],
      availability: '',
      experienceLevel: '',
      _isLocationAutoFilled: false,
    });
    setSortBy('relevance');
    setContentTypeFilter([]);
  };

  const filteredCreators = useMemo(() => {
    let result = creators.filter(creator => {
    const matchesSearch =
      creator.creator_name.toLowerCase().includes(filters.searchTerm.toLowerCase()) ||
      creator.bio?.toLowerCase().includes(filters.searchTerm.toLowerCase()) ||
      creator.skills?.some(skill => skill.toLowerCase().includes(filters.searchTerm.toLowerCase()));

    const matchesSkills = filters.skills.length === 0 ||
      creator.skills?.some(skill => filters.skills.includes(skill));

    // Content-type pill filter (separate from advanced skills filter)
    const matchesContentType = contentTypeFilter.length === 0 ||
      creator.skills?.some(skill => contentTypeFilter.includes(skill));

    // Location filters - structured with legacy fallback
    // Smart filtering: If postal code search with auto-filled city/country, only use postal code
    const isPostalCodeSearch = !!debouncedFilters.postal_code && filters._isLocationAutoFilled;

    const matchesPostalCode = !debouncedFilters.postal_code || (() => {
      const filterPostal = debouncedFilters.postal_code.toLowerCase().trim();
      const creatorPostal = (creator.postal_code || '').toLowerCase().trim();

      if (creatorPostal && creatorPostal.startsWith(filterPostal)) return true;
      if (!creatorPostal && creator.location?.toLowerCase().includes(filterPostal)) return true;
      return false;
    })();

    // If it's a postal code search with auto-filled location, skip city/country filtering
    const matchesCity = isPostalCodeSearch ? true : (!debouncedFilters.city || (() => {
      const filterCity = debouncedFilters.city.toLowerCase().trim();
      const creatorCity = (creator.city || '').toLowerCase().trim();

      if (creatorCity && creatorCity.includes(filterCity)) return true;
      if (!creatorCity && creator.location?.toLowerCase().includes(filterCity)) return true;
      return false;
    })());

    const matchesCountry = isPostalCodeSearch ? true : (!debouncedFilters.country || (() => {
      const filterCountry = debouncedFilters.country.toLowerCase().trim();
      const creatorCountry = (creator.country || '').toLowerCase().trim();

      if (creatorCountry && creatorCountry.includes(filterCountry)) return true;
      if (!creatorCountry && creator.location?.toLowerCase().includes(filterCountry)) return true;
      return false;
    })());

    const matchesRate = (() => {
      const rate = creator.base_rate_per_hour || 0;
      return rate >= filters.minRate && rate <= filters.maxRate;
    })();

    const matchesPlatforms = filters.platforms.length === 0 || (() => {
      const creatorPlatforms = [];
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

      return matchesSearch && matchesSkills && matchesContentType && matchesPostalCode && matchesCity &&
             matchesCountry && matchesRate && matchesPlatforms && matchesAvailability && matchesExperience;
    });

    // Sort
    if (sortBy !== 'relevance') {
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

    return result;
  }, [creators, filters, debouncedFilters, sortBy, contentTypeFilter]);

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
  };
};
