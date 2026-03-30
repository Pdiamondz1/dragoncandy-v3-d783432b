
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useLogout } from '@/hooks/useLogout';
import { supabase } from '@/integrations/supabase/client';
import { ChevronLeft } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
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

      // Redirect to business dashboard on successful profile creation
      navigate('/dashboard/business');
    } catch (error: unknown) {
      const err = error as { message?: string };
      console.error('Error saving profile:', error);
      toast({
        title: "Error saving profile",
        description: err.message || "Please try again.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white overflow-x-hidden">
      {/* Template C Header */}
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center">
        <button
          onClick={logout}
          className="text-dc-pink-accent text-lg p-1"
          aria-label="Logout"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="flex-1 text-center font-sans text-base font-bold text-gray-900 uppercase tracking-wide">
          Business Profile Setup
        </h1>
        <div className="w-7" />
      </div>

      {/* Form Content */}
      <div className="px-4 py-6 pb-24 md:pb-0 max-w-2xl mx-auto">
        <p className="text-sm text-gray-500 mb-6">
          Tell us about your business to get started with DragonCandy.
        </p>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Business Information Section */}
          <div>
            <p className="font-sans text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
              Business Information
            </p>
            <EnhancedBusinessProfileForm
              formData={formData}
              onInputChange={handleInputChange}
            />
          </div>

          {/* Files Section */}
          <div>
            <p className="font-sans text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
              Logo &amp; Sample Content
            </p>
            <FileUploadSection
              logoFile={logoFile}
              sampleFiles={sampleFiles}
              onLogoChange={setLogoFile}
              onSampleFilesChange={setSampleFiles}
            />
          </div>

          {/* Social Media Section */}
          <div>
            <p className="font-sans text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
              Social Media Links
            </p>
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
          </div>

          {/* Submit CTA */}
          <button
            type="submit"
            className="w-full rounded-full bg-dc-teal text-white font-bold py-3 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={loading || !formData.business_name || !formData.industry}
          >
            {loading ? 'Creating Profile...' : 'Complete Profile Setup'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default BusinessProfileSetup;
