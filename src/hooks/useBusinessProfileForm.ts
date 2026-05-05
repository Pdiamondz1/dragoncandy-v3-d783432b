
import { useState, useCallback, useRef } from 'react';
import type { Database } from '@/integrations/supabase/types';

type IndustryType = Database['public']['Enums']['industry_type'];

export interface BusinessProfileFormData {
  business_name: string;
  industry: IndustryType | '';
  website_url: string;
  location: string;
  postal_code: string;
  city: string;
  country: string;
  description: string;
  instagram_url: string;
  tiktok_url: string;
  youtube_url: string;
  facebook_url: string;
  linkedin_url: string;
  x_url: string;
  other_social_url: string;
  logo_url: string;
  company_size: string;
  founded_year: string;
  employee_count_range: string;
  budget_range: string;
  preferred_collaboration_style: string;
  timezone: string;
  profile_visibility: string;
  // Brand-specific fields
  brandCategory?: string;
  sponsorshipBudget?: string;
  marketingObjectives?: string;
}

export const useBusinessProfileForm = () => {
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const hasLoadedRef = useRef(false);
  
  const [formData, setFormData] = useState<BusinessProfileFormData>({
    business_name: '',
    industry: '',
    website_url: '',
    location: '',
    postal_code: '',
    city: '',
    country: '',
    description: '',
    instagram_url: '',
    tiktok_url: '',
    youtube_url: '',
    facebook_url: '',
    linkedin_url: '',
    x_url: '',
    other_social_url: '',
    logo_url: '',
    company_size: '',
    founded_year: '',
    employee_count_range: '',
    budget_range: '',
    preferred_collaboration_style: '',
    timezone: '',
    profile_visibility: 'public'
  });

  const handleInputChange = useCallback((field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  }, []);

  type BusinessProfileRow = Partial<Database['public']['Tables']['business_profiles']['Row']>;
  const setFormDataFromProfile = useCallback((businessProfile: BusinessProfileRow) => {
    // Only load profile data once to prevent overwriting user edits
    if (hasLoadedRef.current) return;
    
    setFormData({
      business_name: businessProfile.business_name || '',
      industry: businessProfile.industry || '',
      website_url: businessProfile.website_url || '',
      location: businessProfile.location || '',
      postal_code: businessProfile.postal_code || '',
      city: businessProfile.city || '',
      country: businessProfile.country || '',
      description: businessProfile.description || '',
      instagram_url: businessProfile.instagram_url || '',
      tiktok_url: businessProfile.tiktok_url || '',
      youtube_url: businessProfile.youtube_url || '',
      facebook_url: businessProfile.facebook_url || '',
      linkedin_url: businessProfile.linkedin_url || '',
      x_url: businessProfile.x_url || '',
      other_social_url: businessProfile.other_social_url || '',
      logo_url: businessProfile.logo_url || '',
      company_size: businessProfile.company_size || '',
      founded_year: businessProfile.founded_year?.toString() || '',
      employee_count_range: businessProfile.employee_count_range || '',
      budget_range: businessProfile.budget_range || '',
      preferred_collaboration_style: businessProfile.preferred_collaboration_style || '',
      timezone: businessProfile.timezone || '',
      profile_visibility: businessProfile.profile_visibility || 'public'
    });
    
    hasLoadedRef.current = true;
  }, []);

  const resetLoaded = useCallback(() => {
    hasLoadedRef.current = false;
  }, []);

  return {
    formData,
    logoFile,
    handleInputChange,
    setLogoFile,
    setFormDataFromProfile,
    resetLoaded
  };
};
