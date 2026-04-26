
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import { ProfileCompletionBar } from '@/components/settings/ProfileCompletionBar';
import { BusinessSettingsSections } from '@/components/settings/BusinessSettingsSections';
import { useBusinessProfileForm } from '@/hooks/useBusinessProfileForm';
import { useBusinessProfileSubmit } from '@/hooks/useBusinessProfileSubmit';
import { calculateBusinessCompletion } from '@/hooks/useProfileCompletion';

const BusinessSettings = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { submitProfile } = useBusinessProfileSubmit();
  const [activeSection, setActiveSection] = useState<string | undefined>(undefined);

  const isBrand = user?.user_metadata?.role === 'brand';

  const {
    formData,
    logoFile,
    handleInputChange,
    setLogoFile,
    setFormDataFromProfile,
  } = useBusinessProfileForm();

  useEffect(() => {
    if (!user) {
      navigate('/auth');
      return;
    }

    const loadProfile = async () => {
      try {
        const { data, error } = await supabase
          .from('business_profiles')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle();

        if (error) {
          console.error('Error loading profile:', error);
          return;
        }

        if (data) {
          setFormDataFromProfile(data);
        }
      } catch (err) {
        console.error('Error loading profile:', err);
      }
    };

    loadProfile();
  }, [user?.id, navigate, setFormDataFromProfile]);

  const handleFieldBlur = async () => {
    if (!user) return;
    const success = await submitProfile(formData, logoFile, user.id, isBrand);
    if (success) {
      setLogoFile(null);
      toast.success('Saved', { duration: 1500 });
    }
  };

  const completion = calculateBusinessCompletion({
    business_name: formData.business_name || undefined,
    industry: formData.industry || null,
    logo_url: formData.logo_url || null,
    description: formData.description || null,
    sample_content_urls: null,
    instagram_url: formData.instagram_url || null,
    tiktok_url: formData.tiktok_url || null,
    youtube_url: formData.youtube_url || null,
    facebook_url: formData.facebook_url || null,
    linkedin_url: formData.linkedin_url || null,
    x_url: formData.x_url || null,
    other_social_url: formData.other_social_url || null,
    budget_range: formData.budget_range || null,
  });

  const handleNudgeClick = () => {
    if (completion.nextSection) {
      setActiveSection(completion.nextSection);
    }
  };

  const roleLabel = isBrand ? 'Brand' : 'Business';
  const displayName = formData.business_name || roleLabel;

  return (
    <DashboardLayout userRole="business_client">
      <div className="min-h-screen bg-gray-400 p-4">
        <div className="max-w-lg mx-auto">
          <ProfileCompletionBar
            avatarUrl={formData.logo_url || null}
            displayName={displayName}
            roleLabel={roleLabel}
            completion={completion}
            isCreator={false}
            onNudgeClick={handleNudgeClick}
          />
          <BusinessSettingsSections
            formData={formData}
            logoFile={logoFile}
            completion={completion}
            onInputChange={handleInputChange}
            onLogoChange={setLogoFile}
            onFieldBlur={handleFieldBlur}
            defaultSection={activeSection}
          />
        </div>
      </div>
    </DashboardLayout>
  );
};

export default BusinessSettings;
