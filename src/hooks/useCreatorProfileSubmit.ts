
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import type { CreatorProfileFormData } from './useCreatorProfileForm';
import type { Database } from '@/integrations/supabase/types';

type CreatorSkill = Database['public']['Enums']['creator_skill'];

export const useCreatorProfileSubmit = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const uploadFile = async (file: File, folder: string) => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${user?.id}/${folder}/${Date.now()}.${fileExt}`;
    
    const { data, error } = await supabase.storage
      .from('profile-assets')
      .upload(fileName, file);

    if (error) throw error;
    return data.path;
  };

  const submitProfile = async (
    formData: CreatorProfileFormData,
    selectedSkills: CreatorSkill[],
    avatarFile: File | null,
    portfolioFiles: File[],
    isUpdate = false
  ) => {
    if (!user) return false;
    
    setLoading(true);
    
    try {
      let avatarUrl = formData.avatar_url;
      let portfolioUrls: string[] = [];

      // Upload avatar if provided
      if (avatarFile) {
        avatarUrl = await uploadFile(avatarFile, 'avatars');
      }

      // Upload portfolio files
      if (portfolioFiles.length > 0) {
        const uploadPromises = portfolioFiles.map(file => uploadFile(file, 'portfolio'));
        portfolioUrls = await Promise.all(uploadPromises);
      }

      // Process languages array
      const languagesArray = formData.languages_spoken 
        ? formData.languages_spoken.split(',').map(lang => lang.trim()).filter(Boolean)
        : [];

      // Prepare the data object
      const profileData = {
        user_id: user.id,
        creator_name: formData.creator_name,
        bio: formData.bio,
        location: formData.location,
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
        updated_at: new Date().toISOString()
      };

      // Add portfolio URLs and is_completed only for new profiles
      if (!isUpdate) {
        (profileData as any).portfolio_urls = portfolioUrls;
        (profileData as any).is_completed = true;
      }

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

      toast({
        title: isUpdate ? "Profile updated successfully!" : "Profile created successfully!",
        description: isUpdate 
          ? "Your creator profile has been updated." 
          : "Welcome to DragonCandy. You can now start browsing campaigns."
      });

      if (!isUpdate) {
        navigate('/');
      }
      
      return true;
    } catch (error: any) {
      console.error('Error saving profile:', error);
      toast({
        title: "Error saving profile",
        description: error.message || "Please try again.",
        variant: "destructive"
      });
      return false;
    } finally {
      setLoading(false);
    }
  };

  return { 
    submitProfile: (formData: CreatorProfileFormData, selectedSkills: CreatorSkill[], avatarFile: File | null, portfolioFiles: File[] = []) => 
      submitProfile(formData, selectedSkills, avatarFile, portfolioFiles, true),
    loading 
  };
};
