import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface LocationProfileFormData {
  name: string;
  description: string;
  brand_category: string;
  logo_url: string;
  sample_content_urls: string[];
  show_parent_brand: boolean;
  instagram_url: string;
  tiktok_url: string;
  youtube_url: string;
  facebook_url: string;
  linkedin_url: string;
  x_url: string;
  other_social_url: string;
}

const EMPTY_FORM: LocationProfileFormData = {
  name: '',
  description: '',
  brand_category: '',
  logo_url: '',
  sample_content_urls: [],
  show_parent_brand: true,
  instagram_url: '',
  tiktok_url: '',
  youtube_url: '',
  facebook_url: '',
  linkedin_url: '',
  x_url: '',
  other_social_url: '',
};

const SELECT_FIELDS = 'name, description, brand_category, logo_url, sample_content_urls, show_parent_brand, instagram_url, tiktok_url, youtube_url, facebook_url, linkedin_url, x_url, other_social_url';

export function useLocationProfileForm(orgUnitId: string | undefined) {
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [formData, setFormData] = useState<LocationProfileFormData>(EMPTY_FORM);
  const [hasLoaded, setHasLoaded] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['location-profile', orgUnitId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('org_units')
        .select(SELECT_FIELDS)
        .eq('id', orgUnitId!)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!orgUnitId,
  });

  if (query.data && hasLoaded !== orgUnitId) {
    const d = query.data;
    setFormData({
      name: d.name || '',
      description: d.description || '',
      brand_category: d.brand_category || '',
      logo_url: d.logo_url || '',
      sample_content_urls: (d.sample_content_urls as string[]) || [],
      show_parent_brand: d.show_parent_brand ?? true,
      instagram_url: d.instagram_url || '',
      tiktok_url: d.tiktok_url || '',
      youtube_url: d.youtube_url || '',
      facebook_url: d.facebook_url || '',
      linkedin_url: d.linkedin_url || '',
      x_url: d.x_url || '',
      other_social_url: d.other_social_url || '',
    });
    setLogoFile(null);
    setHasLoaded(orgUnitId!);
  }

  const handleInputChange = useCallback((field: string, value: string | boolean | string[]) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  }, []);

  return {
    formData,
    logoFile,
    setLogoFile,
    handleInputChange,
    isLoading: query.isLoading,
  };
}
