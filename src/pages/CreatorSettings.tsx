import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import DashboardLayout from '@/components/DashboardLayout';
import { ProfileCompletionBar } from '@/components/settings/ProfileCompletionBar';
import { CreatorSettingsSections } from '@/components/settings/CreatorSettingsSections';
import { useCreatorProfileForm } from '@/hooks/useCreatorProfileForm';
import { useCreatorProfileLoad } from '@/hooks/useCreatorProfileLoad';
import { useCreatorProfileSubmit } from '@/hooks/useCreatorProfileSubmit';
import { calculateCreatorCompletion } from '@/hooks/useProfileCompletion';

const CreatorSettings = () => {
  const { submitProfile } = useCreatorProfileSubmit();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeSection, setActiveSection] = useState<string | undefined>(undefined);

  const {
    formData,
    avatarFile,
    portfolioPaths,
    selectedSkills,
    handleInputChange,
    handleSkillChange,
    setAvatarFile,
    setPortfolioPaths,
    setFormDataFromProfile,
  } = useCreatorProfileForm();

  useCreatorProfileLoad(setFormDataFromProfile);

  // Handle Stripe onboarding return
  useEffect(() => {
    if (searchParams.get('stripe_onboarding') === 'complete') {
      toast.success('Stripe Setup Complete! Your payout account is now connected. You can receive payments.');
      setSearchParams({});
    } else if (searchParams.get('stripe_refresh') === 'true') {
      toast.error('Stripe Setup Incomplete. Please complete your Stripe onboarding to receive payouts.');
      setSearchParams({});
    }
  }, [searchParams, setSearchParams]);

  const handleFieldBlur = async () => {
    const success = await submitProfile(formData, selectedSkills, avatarFile, portfolioPaths, true);
    if (success) {
      setAvatarFile(null);
      toast.success('Saved', { duration: 1500 });
    }
  };

  const handleNudgeClick = () => {
    if (completion.nextSection) {
      setActiveSection(completion.nextSection);
    }
  };

  const completion = calculateCreatorCompletion({
    creator_name: formData.creator_name,
    bio: formData.bio,
    skills: selectedSkills,
    avatar_url: formData.avatar_url || null,
    base_rate_per_hour: formData.base_rate_per_hour ? parseFloat(formData.base_rate_per_hour) : null,
    portfolio_urls: portfolioPaths.length > 0 ? portfolioPaths : null,
    instagram_url: formData.instagram_url || null,
    tiktok_url: formData.tiktok_url || null,
    youtube_url: formData.youtube_url || null,
    facebook_url: formData.facebook_url || null,
    linkedin_url: formData.linkedin_url || null,
    x_url: formData.x_url || null,
    other_social_url: formData.other_social_url || null,
    website_url: formData.website_url || null,
    city: formData.city || null,
    country: formData.country || null,
  });

  return (
    <DashboardLayout userRole="content_creator">
      <div className="min-h-screen bg-white p-4">
        <div className="max-w-lg mx-auto">
          <ProfileCompletionBar
            avatarUrl={formData.avatar_url || null}
            displayName={formData.creator_name || 'Creator'}
            roleLabel="Content Creator"
            completion={completion}
            isCreator={true}
            onNudgeClick={handleNudgeClick}
          />
          <CreatorSettingsSections
            formData={formData}
            selectedSkills={selectedSkills}
            avatarFile={avatarFile}
            portfolioPaths={portfolioPaths}
            completion={completion}
            onInputChange={handleInputChange}
            onSkillChange={handleSkillChange}
            onAvatarFileChange={setAvatarFile}
            onPortfolioPathsChange={setPortfolioPaths}
            onFieldBlur={handleFieldBlur}
            defaultSection={activeSection}
          />
        </div>
      </div>
    </DashboardLayout>
  );
};

export default CreatorSettings;
