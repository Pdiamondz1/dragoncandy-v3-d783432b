
import React from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface CreatorProfile {
  id: string;
  user_id: string;
  creator_name: string;
  avatar_url?: string;
  bio?: string;
  skills?: string[];
  portfolio_urls?: string[];
  location?: string;
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

export interface CreatorFilters {
  searchTerm: string;
  skills: string[];
  location: string;
  minRate: number;
  maxRate: number;
  platforms: string[];
  availability: string;
  experienceLevel: string;
}

export const useCreatorBrowse = () => {
  const { user } = useAuth();
  const [filters, setFilters] = React.useState<CreatorFilters>({
    searchTerm: '',
    skills: [],
    location: '',
    minRate: 0,
    maxRate: 500,
    platforms: [],
    availability: '',
    experienceLevel: '',
  });

  const { data: creators = [], isLoading, error } = useQuery({
    queryKey: ['available-creators'],
    queryFn: async () => {
      console.log('Fetching available creators');
      const { data, error } = await supabase
        .from('creator_profiles')
        .select('*')
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

  const handleFilterChange = (key: keyof CreatorFilters, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const resetFilters = () => {
    setFilters({
      searchTerm: '',
      skills: [],
      location: '',
      minRate: 0,
      maxRate: 500,
      platforms: [],
      availability: '',
      experienceLevel: '',
    });
  };

  // Filter creators based on search criteria
  const filteredCreators = creators.filter(creator => {
    const matchesSearch = 
      creator.creator_name.toLowerCase().includes(filters.searchTerm.toLowerCase()) ||
      creator.bio?.toLowerCase().includes(filters.searchTerm.toLowerCase()) ||
      creator.skills?.some(skill => skill.toLowerCase().includes(filters.searchTerm.toLowerCase()));

    const matchesSkills = filters.skills.length === 0 || 
      creator.skills?.some(skill => filters.skills.includes(skill));

    const matchesLocation = !filters.location ||
      creator.location?.toLowerCase().includes(filters.location.toLowerCase());

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

    return matchesSearch && matchesSkills && matchesLocation && matchesRate && 
           matchesPlatforms && matchesAvailability && matchesExperience;
  });

  return {
    creators,
    filteredCreators,
    filters,
    isLoading,
    error,
    handleFilterChange,
    resetFilters,
  };
};
