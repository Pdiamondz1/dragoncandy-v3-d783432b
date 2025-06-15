
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from '@/hooks/use-toast';
import { Upload, Sparkles } from 'lucide-react';
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
              <div>
                <Label>Profile Picture</Label>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                  <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                  <div className="text-sm text-gray-600 mb-2">
                    {avatarFile ? avatarFile.name : 'Upload your profile picture'}
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
              <div>
                <Label>Skills & Services *</Label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-2">
                  {skills.map((skill) => (
                    <div key={skill.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={skill.id}
                        checked={selectedSkills.includes(skill.id)}
                        onCheckedChange={(checked) => handleSkillChange(skill.id, checked as boolean)}
                      />
                      <Label htmlFor={skill.id} className="text-sm">
                        {skill.label}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>

              {/* Location & Availability */}
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
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Social Media & Website</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="instagram_url">Instagram</Label>
                    <Input
                      id="instagram_url"
                      value={formData.instagram_url}
                      onChange={(e) => handleInputChange('instagram_url', e.target.value)}
                      placeholder="https://instagram.com/yourcreator"
                    />
                  </div>
                  <div>
                    <Label htmlFor="tiktok_url">TikTok</Label>
                    <Input
                      id="tiktok_url"
                      value={formData.tiktok_url}
                      onChange={(e) => handleInputChange('tiktok_url', e.target.value)}
                      placeholder="https://tiktok.com/@yourcreator"
                    />
                  </div>
                  <div>
                    <Label htmlFor="youtube_url">YouTube</Label>
                    <Input
                      id="youtube_url"
                      value={formData.youtube_url}
                      onChange={(e) => handleInputChange('youtube_url', e.target.value)}
                      placeholder="https://youtube.com/c/yourcreator"
                    />
                  </div>
                  <div>
                    <Label htmlFor="facebook_url">Facebook</Label>
                    <Input
                      id="facebook_url"
                      value={formData.facebook_url}
                      onChange={(e) => handleInputChange('facebook_url', e.target.value)}
                      placeholder="https://facebook.com/yourcreator"
                    />
                  </div>
                  <div>
                    <Label htmlFor="linkedin_url">LinkedIn</Label>
                    <Input
                      id="linkedin_url"
                      value={formData.linkedin_url}
                      onChange={(e) => handleInputChange('linkedin_url', e.target.value)}
                      placeholder="https://linkedin.com/in/yourcreator"
                    />
                  </div>
                  <div>
                    <Label htmlFor="x_url">X (Twitter)</Label>
                    <Input
                      id="x_url"
                      value={formData.x_url}
                      onChange={(e) => handleInputChange('x_url', e.target.value)}
                      placeholder="https://x.com/yourcreator"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="website_url">Website</Label>
                    <Input
                      id="website_url"
                      value={formData.website_url}
                      onChange={(e) => handleInputChange('website_url', e.target.value)}
                      placeholder="https://yourwebsite.com"
                    />
                  </div>
                  <div>
                    <Label htmlFor="other_social_url">Other Social Media</Label>
                    <Input
                      id="other_social_url"
                      value={formData.other_social_url}
                      onChange={(e) => handleInputChange('other_social_url', e.target.value)}
                      placeholder="Any other social media link"
                    />
                  </div>
                </div>
              </div>

              {/* Portfolio Upload */}
              <div>
                <Label>Portfolio</Label>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                  <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                  <div className="text-sm text-gray-600 mb-2">
                    {portfolioFiles.length > 0 ? `${portfolioFiles.length} files selected` : 'Upload your best work samples'}
                  </div>
                  <input
                    type="file"
                    multiple
                    accept="image/*,video/*"
                    onChange={(e) => setPortfolioFiles(Array.from(e.target.files || []))}
                    className="hidden"
                    id="portfolio-upload"
                  />
                  <Button type="button" variant="outline" asChild>
                    <label htmlFor="portfolio-upload" className="cursor-pointer">
                      Choose Files
                    </label>
                  </Button>
                </div>
              </div>

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
