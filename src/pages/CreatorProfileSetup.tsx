
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import { Sparkles } from 'lucide-react';
import { SkillsSelection } from '@/components/creator-profile/SkillsSelection';
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
              {/* Creator Name */}
              <div>
                <Label htmlFor="creator_name">Creator Name *</Label>
                <Input
                  id="creator_name"
                  value={formData.creator_name}
                  onChange={(e) => handleInputChange('creator_name', e.target.value)}
                  placeholder="Your creative name or real name"
                  required
                />
              </div>

              {/* Avatar Upload */}
              <AvatarUpload 
                avatarFile={avatarFile}
                onAvatarFileChange={setAvatarFile}
              />

              {/* Bio */}
              <div>
                <Label htmlFor="bio">Bio *</Label>
                <Textarea
                  id="bio"
                  value={formData.bio}
                  onChange={(e) => handleInputChange('bio', e.target.value)}
                  placeholder="Tell brands about yourself, your experience, and what makes you unique..."
                  rows={4}
                  required
                />
              </div>

              {/* Skills */}
              <SkillsSelection 
                selectedSkills={selectedSkills}
                onSkillChange={handleSkillChange}
              />

              {/* Location & Rate */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="location">Location</Label>
                  <Input
                    id="location"
                    value={formData.location}
                    onChange={(e) => handleInputChange('location', e.target.value)}
                    placeholder="City, Country"
                  />
                </div>
                <div>
                  <Label htmlFor="base_rate_per_hour">Base Rate ($/hour)</Label>
                  <Input
                    id="base_rate_per_hour"
                    type="number"
                    value={formData.base_rate_per_hour}
                    onChange={(e) => handleInputChange('base_rate_per_hour', e.target.value)}
                    placeholder="50"
                  />
                </div>
              </div>

              {/* Availability */}
              <div>
                <Label htmlFor="availability">Availability</Label>
                <Textarea
                  id="availability"
                  value={formData.availability}
                  onChange={(e) => handleInputChange('availability', e.target.value)}
                  placeholder="e.g., Available weekdays, 2-3 projects per month, etc."
                  rows={2}
                />
              </div>

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
