
import { useState, useCallback, useRef } from 'react';
import type { Database } from '@/integrations/supabase/types';

type CreatorSkill = Database['public']['Enums']['creator_skill'];

export interface CreatorProfileFormData {
  creator_name: string;
  bio: string;
  location: string;
  availability: string;
  base_rate_per_hour: string;
  years_of_experience: string;
  languages_spoken: string;
  timezone: string;
  response_time: string;
  min_project_budget: string;
  max_projects_per_month: string;
  preferred_project_duration: string;
  collaboration_preferences: string;
  profile_visibility: string;
  instagram_url: string;
  tiktok_url: string;
  youtube_url: string;
  facebook_url: string;
  linkedin_url: string;
  x_url: string;
  other_social_url: string;
  website_url: string;
  avatar_url: string;
  allow_portfolio_in_feed: boolean;
}

export const useCreatorProfileForm = () => {
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [portfolioPaths, setPortfolioPaths] = useState<string[]>([]);
  const [selectedSkills, setSelectedSkills] = useState<CreatorSkill[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  
  const [formData, setFormData] = useState<CreatorProfileFormData>({
    creator_name: '',
    bio: '',
    location: '',
    availability: '',
    base_rate_per_hour: '',
    years_of_experience: '',
    languages_spoken: '',
    timezone: '',
    response_time: '',
    min_project_budget: '',
    max_projects_per_month: '',
    preferred_project_duration: '',
    collaboration_preferences: '',
    profile_visibility: 'public',
    instagram_url: '',
    tiktok_url: '',
    youtube_url: '',
    facebook_url: '',
    linkedin_url: '',
    x_url: '',
    other_social_url: '',
    website_url: '',
    avatar_url: '',
    allow_portfolio_in_feed: false
  });

  const handleInputChange = (field: string, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSkillChange = (skillId: CreatorSkill, checked: boolean) => {
    if (checked) {
      setSelectedSkills(prev => [...prev, skillId]);
    } else {
      setSelectedSkills(prev => prev.filter(id => id !== skillId));
    }
  };

  const setFormDataFromProfile = useCallback((profile: any) => {
    if (isLoaded) return; // Prevent reloading if already loaded
    
    setFormData({
      creator_name: profile.creator_name || '',
      bio: profile.bio || '',
      location: profile.location || '',
      availability: profile.availability || '',
      base_rate_per_hour: profile.base_rate_per_hour?.toString() || '',
      years_of_experience: profile.years_of_experience?.toString() || '',
      languages_spoken: Array.isArray(profile.languages_spoken) 
        ? profile.languages_spoken.join(', ') 
        : profile.languages_spoken || '',
      timezone: profile.timezone || '',
      response_time: profile.response_time || '',
      min_project_budget: profile.min_project_budget?.toString() || '',
      max_projects_per_month: profile.max_projects_per_month?.toString() || '',
      preferred_project_duration: profile.preferred_project_duration || '',
      collaboration_preferences: profile.collaboration_preferences || '',
      profile_visibility: profile.profile_visibility || 'public',
      instagram_url: profile.instagram_url || '',
      tiktok_url: profile.tiktok_url || '',
      youtube_url: profile.youtube_url || '',
      facebook_url: profile.facebook_url || '',
      linkedin_url: profile.linkedin_url || '',
      x_url: profile.x_url || '',
      other_social_url: profile.other_social_url || '',
      website_url: profile.website_url || '',
      avatar_url: profile.avatar_url || '',
      allow_portfolio_in_feed: profile.allow_portfolio_in_feed || false
    });
    setSelectedSkills(profile.skills as CreatorSkill[] || []);
    setIsLoaded(true);
  }, [isLoaded]);

  const isFormValid = () => {
    return formData.creator_name && formData.bio && selectedSkills.length > 0;
  };

  return {
    formData,
    avatarFile,
    portfolioPaths,
    selectedSkills,
    handleInputChange,
    handleSkillChange,
    setAvatarFile,
    setPortfolioPaths,
    setFormDataFromProfile,
    setSelectedSkills,
    isFormValid
  };
};
