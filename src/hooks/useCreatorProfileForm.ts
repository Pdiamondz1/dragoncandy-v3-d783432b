
import { useState } from 'react';
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
}

export const useCreatorProfileForm = () => {
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [portfolioFiles, setPortfolioFiles] = useState<File[]>([]);
  const [selectedSkills, setSelectedSkills] = useState<CreatorSkill[]>([]);
  
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
    website_url: ''
  });

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSkillChange = (skillId: CreatorSkill, checked: boolean) => {
    if (checked) {
      setSelectedSkills(prev => [...prev, skillId]);
    } else {
      setSelectedSkills(prev => prev.filter(id => id !== skillId));
    }
  };

  const isFormValid = () => {
    return formData.creator_name && formData.bio && selectedSkills.length > 0;
  };

  return {
    formData,
    avatarFile,
    portfolioFiles,
    selectedSkills,
    handleInputChange,
    handleSkillChange,
    setAvatarFile,
    setPortfolioFiles,
    isFormValid
  };
};
