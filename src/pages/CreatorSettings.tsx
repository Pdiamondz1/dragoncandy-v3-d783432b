
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from '@/hooks/use-toast';
import { Upload } from 'lucide-react';
import type { Database } from '@/integrations/supabase/types';

type CreatorSkill = Database['public']['Enums']['creator_skill'];

const skills: { id: CreatorSkill; label: string }[] = [
  { id: 'video_editing', label: 'Video Editing' },
  { id: 'ugc_creation', label: 'UGC Creation' },
  { id: 'illustration', label: 'Illustration' },
  { id: 'photography', label: 'Photography' },
  { id: 'copywriting', label: 'Copywriting' },
  { id: 'social_media_management', label: 'Social Media Management' },
  { id: 'graphic_design', label: 'Graphic Design' },
  { id: 'animation', label: 'Animation' },
  { id: 'influencer_marketing', label: 'Influencer Marketing' },
  { id: 'content_strategy', label: 'Content Strategy' },
  { id: 'other', label: 'Other' }
];

const CreatorSettings = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  
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
    website_url: '',
    avatar_url: ''
  });

  const [selectedSkills, setSelectedSkills] = useState<CreatorSkill[]>([]);

  useEffect(() => {
    if (!user) {
      navigate('/auth');
      return;
    }

    const loadProfile = async () => {
      try {
        const { data: creatorProfile } = await supabase
          .from('creator_profiles')
          .select('*')
          .eq('user_id', user.id)
          .single();

        if (creatorProfile) {
          setFormData({
            creator_name: creatorProfile.creator_name || '',
            bio: creatorProfile.bio || '',
            location: creatorProfile.location || '',
            availability: creatorProfile.availability || '',
            base_rate_per_hour: creatorProfile.base_rate_per_hour?.toString() || '',
            instagram_url: creatorProfile.instagram_url || '',
            tiktok_url: creatorProfile.tiktok_url || '',
            youtube_url: creatorProfile.youtube_url || '',
            facebook_url: creatorProfile.facebook_url || '',
            linkedin_url: creatorProfile.linkedin_url || '',
            x_url: creatorProfile.x_url || '',
            other_social_url: creatorProfile.other_social_url || '',
            website_url: creatorProfile.website_url || '',
            avatar_url: creatorProfile.avatar_url || ''
          });
          setSelectedSkills(creatorProfile.skills as CreatorSkill[] || []);
        }
      } catch (error) {
        console.error('Error loading profile:', error);
      }
    };

    loadProfile();
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
      let avatarUrl = formData.avatar_url;

      // Upload new avatar if provided
      if (avatarFile) {
        avatarUrl = await uploadFile(avatarFile, 'avatars');
      }

      // Update profile data
      const { error } = await supabase
        .from('creator_profiles')
        .update({
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
          skills: selectedSkills,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', user.id);

      if (error) throw error;

      toast({
        title: "Profile updated successfully!",
        description: "Your creator profile has been updated."
      });

      setAvatarFile(null);
    } catch (error: any) {
      console.error('Error updating profile:', error);
      toast({
        title: "Error updating profile",
        description: error.message || "Please try again.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout userRole="content_creator">
      <div className="flex-1 p-8">
        <div className="max-w-2xl">
          <h1 className="text-3xl font-bold text-gray-900 mb-8">Account Settings</h1>

          <Card>
            <CardHeader>
              <CardTitle>Creator Profile</CardTitle>
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
                    placeholder="Your Creator Name"
                    required
                  />
                </div>

                {/* Avatar Upload */}
                <div>
                  <Label>Profile Picture</Label>
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                    <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                    <div className="text-sm text-gray-600 mb-2">
                      {avatarFile ? avatarFile.name : 'Click to upload your profile picture'}
                    </div>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => setAvatarFile(e.target.files?.[0] || null)}
                      className="hidden"
                      id="avatar-upload"
                    />
                    <Button type="button" variant="outline" asChild>
                      <label htmlFor="avatar-upload" className="cursor-pointer">
                        Choose File
                      </label>
                    </Button>
                  </div>
                </div>

                {/* Bio */}
                <div>
                  <Label htmlFor="bio">Bio</Label>
                  <Textarea
                    id="bio"
                    value={formData.bio}
                    onChange={(e) => handleInputChange('bio', e.target.value)}
                    placeholder="Tell us about yourself..."
                    rows={4}
                  />
                </div>

                {/* Skills */}
                <div>
                  <Label>Skills</Label>
                  <div className="grid grid-cols-2 gap-3 mt-2">
                    {skills.map((skill) => (
                      <div key={skill.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={skill.id}
                          checked={selectedSkills.includes(skill.id)}
                          onCheckedChange={(checked) => handleSkillChange(skill.id, checked as boolean)}
                        />
                        <Label htmlFor={skill.id} className="text-sm font-normal">
                          {skill.label}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>

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
                    <Label htmlFor="base_rate_per_hour">Hourly Rate ($)</Label>
                    <Input
                      id="base_rate_per_hour"
                      type="number"
                      value={formData.base_rate_per_hour}
                      onChange={(e) => handleInputChange('base_rate_per_hour', e.target.value)}
                      placeholder="50"
                    />
                  </div>
                </div>

                {/* Submit Button */}
                <Button
                  type="submit"
                  className="bg-pink-600 hover:bg-pink-700"
                  disabled={loading}
                >
                  {loading ? 'Updating...' : 'Update Profile'}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default CreatorSettings;
