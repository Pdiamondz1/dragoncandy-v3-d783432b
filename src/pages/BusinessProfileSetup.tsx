
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useLogout } from '@/hooks/useLogout';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';
import { Sparkles } from 'lucide-react';
import { EnhancedBusinessProfileForm } from '@/components/business-profile/EnhancedBusinessProfileForm';
import { FileUploadSection } from '@/components/business-profile/FileUploadSection';
import { SocialMediaLinks } from '@/components/business-profile/SocialMediaLinks';
import type { Database } from '@/integrations/supabase/types';

type IndustryType = Database['public']['Enums']['industry_type'];

const BusinessProfileSetup = () => {
  const { user } = useAuth();
  const logout = useLogout();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [sampleFiles, setSampleFiles] = useState<File[]>([]);
  
  const [formData, setFormData] = useState({
    business_name: '',
    industry: '' as IndustryType | '',
    website_url: '',
    location: '',
    postal_code: '',
    city: '',
    country: '',
    description: '',
    company_size: '',
    founded_year: '',
    employee_count_range: '',
    budget_range: '',
    preferred_collaboration_style: '',
    timezone: '',
    profile_visibility: 'public',
    instagram_url: '',
    tiktok_url: '',
    youtube_url: '',
    facebook_url: '',
    linkedin_url: '',
    x_url: '',
    other_social_url: ''
  });

  useEffect(() => {
    if (!user) {
      navigate('/auth');
    }
  }, [user, navigate]);

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
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
      let logoUrl = '';
      let sampleContentUrls: string[] = [];

      // Upload logo if provided
      if (logoFile) {
        logoUrl = await uploadFile(logoFile, 'logos');
      }

      // Upload sample content files
      if (sampleFiles.length > 0) {
        const uploadPromises = sampleFiles.map(file => uploadFile(file, 'samples'));
        sampleContentUrls = await Promise.all(uploadPromises);
      }

      // Save profile data
      const { error } = await supabase
        .from('business_profiles')
        .upsert({
          user_id: user.id,
          business_name: formData.business_name,
          industry: formData.industry as IndustryType,
          website_url: formData.website_url,
          location: formData.location,
          postal_code: formData.postal_code,
          city: formData.city,
          country: formData.country,
          description: formData.description,
          company_size: formData.company_size,
          founded_year: formData.founded_year ? parseInt(formData.founded_year) : null,
          employee_count_range: formData.employee_count_range,
          budget_range: formData.budget_range,
          preferred_collaboration_style: formData.preferred_collaboration_style,
          timezone: formData.timezone,
          profile_visibility: formData.profile_visibility,
          instagram_url: formData.instagram_url,
          tiktok_url: formData.tiktok_url,
          youtube_url: formData.youtube_url,
          facebook_url: formData.facebook_url,
          linkedin_url: formData.linkedin_url,
          x_url: formData.x_url,
          other_social_url: formData.other_social_url,
          logo_url: logoUrl,
          sample_content_urls: sampleContentUrls,
          is_completed: true
        });

      if (error) throw error;

      toast({
        title: "Profile created successfully!",
        description: "Welcome to DragonCandy. You can now start creating campaigns."
      });

      // Redirect to restaurant dashboard on successful profile creation
      navigate('/dashboard/business');
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
        <div className="text-center mb-8 relative">
          <Button
            variant="outline"
            onClick={logout}
            className="absolute top-0 right-0 text-gray-600 hover:text-gray-900"
          >
            Logout
          </Button>
          <div className="rounded-full bg-pink-100 p-3 mx-auto mb-4 w-16 h-16 flex items-center justify-center">
            <Sparkles className="text-pink-600 w-8 h-8" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Complete Your Business Profile
          </h1>
          <p className="text-gray-600">
            Tell us about your business to get started with DragonCandy
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Business Information</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <EnhancedBusinessProfileForm 
                formData={formData}
                onInputChange={handleInputChange}
              />

              <FileUploadSection
                logoFile={logoFile}
                sampleFiles={sampleFiles}
                onLogoChange={setLogoFile}
                onSampleFilesChange={setSampleFiles}
              />

              <SocialMediaLinks
                formData={{
                  instagram_url: formData.instagram_url,
                  tiktok_url: formData.tiktok_url,
                  youtube_url: formData.youtube_url,
                  facebook_url: formData.facebook_url,
                  linkedin_url: formData.linkedin_url,
                  x_url: formData.x_url,
                  other_social_url: formData.other_social_url
                }}
                onInputChange={handleInputChange}
              />

              {/* Submit Button */}
              <Button
                type="submit"
                className="w-full bg-pink-600 hover:bg-pink-700"
                disabled={loading || !formData.business_name || !formData.industry}
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

export default BusinessProfileSetup;
