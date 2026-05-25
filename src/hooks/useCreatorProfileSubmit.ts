
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import {
  uploadProfileAsset,
  UploadError,
} from '@/lib/storage/uploadProfileAsset';
import { clearSignedUrlCache } from '@/hooks/useSignedUrl';
import { clearProfileCache } from '@/hooks/useProfileData';
import type { CreatorProfileFormData } from './useCreatorProfileForm';
import type { Database } from '@/integrations/supabase/types';

type CreatorSkill = Database['public']['Enums']['creator_skill'];

export const useCreatorProfileSubmit = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);

  const submitProfile = async (
    formData: CreatorProfileFormData,
    selectedSkills: CreatorSkill[],
    avatarFile: File | null,
    portfolioPaths: string[],
    isUpdate = false,
    preUploadedAvatarUrl?: string
  ) => {
    if (!user) return false;

    setLoading(true);

    try {
      let avatarUrl = formData.avatar_url;

      // Use pre-uploaded URL if available, otherwise upload now
      if (preUploadedAvatarUrl) {
        avatarUrl = preUploadedAvatarUrl;
      } else if (avatarFile) {
        const result = await uploadProfileAsset({
          file: avatarFile,
          userId: user.id,
          kind: 'avatar',
        });
        avatarUrl = result.path;
      }

      // Portfolio files are already uploaded, use the paths directly
      const portfolioUrls = portfolioPaths;

      // Process languages array
      const languagesArray = formData.languages_spoken
        ? formData.languages_spoken.split(',').map(lang => lang.trim()).filter(Boolean)
        : [];

      // Prepare the data object
      const profileData = {
        user_id: user.id,
        creator_name: formData.creator_name,
        bio: formData.bio,
        location: formData.location || `${formData.city}${formData.city && formData.country ? ', ' : ''}${formData.country}`,
        city: formData.city || null,
        country: formData.country || null,
        postal_code: formData.postal_code || null,
        availability: formData.availability,
        base_rate_per_hour: formData.base_rate_per_hour ? parseFloat(formData.base_rate_per_hour) : null,
        years_of_experience: formData.years_of_experience ? parseInt(formData.years_of_experience) : null,
        languages_spoken: languagesArray,
        timezone: formData.timezone,
        response_time: formData.response_time,
        min_project_budget: formData.min_project_budget ? parseFloat(formData.min_project_budget) : null,
        max_projects_per_month: formData.max_projects_per_month ? parseInt(formData.max_projects_per_month) : null,
        preferred_project_duration: formData.preferred_project_duration,
        collaboration_preferences: formData.collaboration_preferences,
        profile_visibility: formData.profile_visibility,
        instagram_url: formData.instagram_url,
        tiktok_url: formData.tiktok_url,
        youtube_url: formData.youtube_url,
        facebook_url: formData.facebook_url,
        linkedin_url: formData.linkedin_url,
        x_url: formData.x_url,
        other_social_url: formData.other_social_url,
        website_url: formData.website_url,
        avatar_url: avatarUrl,
        skills: selectedSkills,
        allow_portfolio_in_feed: formData.allow_portfolio_in_feed,
        updated_at: new Date().toISOString(),
        portfolio_urls: portfolioUrls,
        ...(!isUpdate ? { is_completed: true } : {}),
      };

      // Save profile data
      const { error } = isUpdate
        ? await supabase
            .from('creator_profiles')
            .update(profileData)
            .eq('user_id', user.id)
        : await supabase
            .from('creator_profiles')
            .upsert(profileData);

      if (error) throw error;

      if (avatarUrl) {
        await supabase
          .from('profiles')
          .update({ avatar_url: avatarUrl })
          .eq('id', user.id);
      }

      clearSignedUrlCache();
      clearProfileCache(user.id);
      queryClient.invalidateQueries({ queryKey: ['available-creators'] });

      toast({
        title: isUpdate ? "Profile updated successfully!" : "Profile created successfully!",
        description: isUpdate
          ? "Your creator profile has been updated."
          : "Welcome to DragonCandy. You can now start browsing campaigns."
      });

      return true;
    } catch (error: unknown) {
      console.error('Error saving profile:', error);
      const msg = error instanceof UploadError
        ? `Upload failed: ${error.message}`
        : error instanceof Error ? error.message : 'Please try again.';
      toast({
        title: "Error saving profile",
        description: msg,
        variant: "destructive"
      });
      return false;
    } finally {
      setLoading(false);
    }
  };

  return {
    submitProfile,
    loading
  };
};
