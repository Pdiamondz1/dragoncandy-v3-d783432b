
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';
import { Sparkles } from 'lucide-react';
import { SkillsSelection } from '@/components/creator-profile/SkillsSelection';
import { EnhancedCreatorProfileForm } from '@/components/creator-profile/EnhancedCreatorProfileForm';
import { CreatorSocialMediaLinks } from '@/components/creator-profile/CreatorSocialMediaLinks';
import { PortfolioUpload } from '@/components/creator-profile/PortfolioUpload';
import { AvatarUpload } from '@/components/creator-profile/AvatarUpload';
import type { Database } from '@/integrations/supabase/types';

type CreatorSkill = Database['public']['Enums']['creator_skill'];

const CreatorProfileSetup = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [portfolioFiles, setPortfolioFiles] = useState<File[]>([]);
  
  const [formData, setFormData] = useState({
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

  const [selectedSkills, setSelectedSkills] = useState<CreatorSkill[]>([]);

  useEffect(() => {
    if (!user) {
      navigate('/auth');
    }
  }, [user, navigate]);

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

  const uploadFile = async (file: File, folder: string) => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${user?.id}/${folder}/${Date.now()}.${fileExt}`;
    
    const { data, error } = await supabase.storage
      .from('profile-assets')
      .upload(fileName, file);

    if (error) throw error;
    return data.path;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    setLoading(true);
    
    try {
      let avatarUrl = '';
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

      // Save profile data
      const { error } = await supabase
        .from('creator_profiles')
        .upsert({
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
          portfolio_urls: portfolioUrls,
          skills: selectedSkills,
          is_completed: true
        });

      if (error) throw error;

      toast({
        title: "Profile created successfully!",
        description: "Welcome to DragonCandy. You can now start browsing campaigns."
      });

      navigate('/');
    } catch (error: any) {
      console.error('Error saving profile:', error);
      toast({
        title: "Error saving profile",
        description: error.message || "Please try again.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-pink-50 py-8">
      <div className="max-w-2xl mx-auto px-4">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="rounded-full bg-pink-100 p-3 mx-auto mb-4 w-16 h-16 flex items-center justify-center">
            <Sparkles className="text-pink-600 w-8 h-8" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Complete Your Creator Profile
          </h1>
          <p className="text-gray-600">
            Showcase your skills and start getting discovered by brands
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Creator Information</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <EnhancedCreatorProfileForm 
                formData={formData}
                onInputChange={handleInputChange}
              />

              {/* Avatar Upload */}
              <AvatarUpload 
                avatarFile={avatarFile}
                onAvatarFileChange={setAvatarFile}
              />

              {/* Skills */}
              <SkillsSelection 
                selectedSkills={selectedSkills}
                onSkillChange={handleSkillChange}
              />

              {/* Social Media & Website */}
              <CreatorSocialMediaLinks 
                formData={formData}
                onInputChange={handleInputChange}
              />

              {/* Portfolio Upload */}
              <PortfolioUpload 
                portfolioFiles={portfolioFiles}
                onPortfolioFilesChange={setPortfolioFiles}
              />

              {/* Submit Button */}
              <Button
                type="submit"
                className="w-full bg-pink-600 hover:bg-pink-700"
                disabled={loading || !formData.creator_name || !formData.bio || selectedSkills.length === 0}
              >
                {loading ? 'Creating Profile...' : 'Complete Profile Setup'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default CreatorProfileSetup;
