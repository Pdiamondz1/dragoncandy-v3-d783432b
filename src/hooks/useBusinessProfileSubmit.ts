
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import type { BusinessProfileFormData } from './useBusinessProfileForm';
import type { Database } from '@/integrations/supabase/types';

type IndustryType = Database['public']['Enums']['industry_type'];

export const useBusinessProfileSubmit = () => {
  const [loading, setLoading] = useState(false);

  const uploadFile = async (file: File, folder: string, userId: string) => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${userId}/${folder}/${Date.now()}.${fileExt}`;
    
    const { data, error } = await supabase.storage
      .from('profile-assets')
      .upload(fileName, file);

    if (error) throw error;
    return data.path;
  };

  const submitProfile = async (
    formData: BusinessProfileFormData,
    logoFile: File | null,
    userId: string,
    isBrand: boolean = false
  ) => {
    setLoading(true);
    
    try {
      let logoUrl = formData.logo_url;

      // Upload new logo if provided
      if (logoFile) {
        logoUrl = await uploadFile(logoFile, 'logos', userId);
      }

      const accountType = isBrand ? 'brand' : 'restaurant';

      // Base profile data
      const profileData: any = {
        business_name: formData.business_name,
        industry: formData.industry as IndustryType,
        website_url: formData.website_url,
        location: formData.location,
        description: formData.description,
        instagram_url: formData.instagram_url,
        tiktok_url: formData.tiktok_url,
        youtube_url: formData.youtube_url,
        facebook_url: formData.facebook_url,
        linkedin_url: formData.linkedin_url,
        x_url: formData.x_url,
        other_social_url: formData.other_social_url,
        logo_url: logoUrl,
        company_size: formData.company_size,
        founded_year: formData.founded_year ? parseInt(formData.founded_year) : null,
        employee_count_range: formData.employee_count_range,
        budget_range: formData.budget_range,
        preferred_collaboration_style: formData.preferred_collaboration_style,
        timezone: formData.timezone,
        profile_visibility: formData.profile_visibility,
        updated_at: new Date().toISOString(),
        is_completed: true
      };

      // Add brand-specific fields if this is a brand profile
      if (isBrand) {
        profileData.brand_category = formData.brandCategory || null;
        profileData.marketing_objectives = formData.marketingObjectives || null;
      }

      // Check if profile exists for this account type
      const { data: existing, error: lookupError } = await supabase
        .from('business_profiles')
        .select('id')
        .eq('user_id', userId)
        .eq('account_type', accountType)
        .maybeSingle();

      if (lookupError) throw lookupError;

      if (existing) {
        // Update existing profile
        const { error: updateError } = await supabase
          .from('business_profiles')
          .update(profileData)
          .eq('id', existing.id);

        if (updateError) throw updateError;
      } else {
        // Insert new profile
        const { error: insertError } = await supabase
          .from('business_profiles')
          .insert({
            ...profileData,
            user_id: userId,
            account_type: accountType
          });

        if (insertError) throw insertError;
      }

      toast({
        title: "Profile saved successfully!",
        description: isBrand ? "Your brand profile has been created." : "Your business profile has been updated."
      });

      return true;
    } catch (error: any) {
      console.error('Error updating profile:', error);
      toast({
        title: "Error updating profile",
        description: error.message || "Please try again.",
        variant: "destructive"
      });
      return false;
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (onSuccess?: () => void, isBrand: boolean = false) => async (e: React.FormEvent, formData: BusinessProfileFormData, logoFile: File | null, userId: string) => {
    e.preventDefault();
    const success = await submitProfile(formData, logoFile, userId, isBrand);
    if (success && onSuccess) {
      onSuccess();
    }
  };

  return {
    submitProfile,
    handleSubmit,
    loading
  };
};
