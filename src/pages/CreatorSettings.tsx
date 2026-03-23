import React, { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import DashboardLayout from '@/components/DashboardLayout';
import { CreatorSettingsHeader } from '@/components/creator-profile/CreatorSettingsHeader';
import { CreatorSettingsForm } from '@/components/creator-profile/CreatorSettingsForm';
import { useCreatorProfileForm } from '@/hooks/useCreatorProfileForm';
import { useCreatorProfileLoad } from '@/hooks/useCreatorProfileLoad';
import { useCreatorProfileSubmit } from '@/hooks/useCreatorProfileSubmit';
import { useToast } from '@/hooks/use-toast';

const CreatorSettings = () => {
  const { submitProfile, loading } = useCreatorProfileSubmit();
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();
  
  const {
    formData,
    avatarFile,
    portfolioPaths,
    selectedSkills,
    handleInputChange,
    handleSkillChange,
    setAvatarFile,
    setPortfolioPaths,
    setFormDataFromProfile
  } = useCreatorProfileForm();

  const { user } = useCreatorProfileLoad(setFormDataFromProfile);

  // Handle Stripe onboarding return
  useEffect(() => {
    if (searchParams.get('stripe_onboarding') === 'complete') {
      toast({
        title: 'Stripe Setup Complete!',
        description: 'Your payout account is now connected. You can receive payments.',
      });
      setSearchParams({});
    } else if (searchParams.get('stripe_refresh') === 'true') {
      toast({
        title: 'Stripe Setup Incomplete',
        description: 'Please complete your Stripe onboarding to receive payouts.',
        variant: 'destructive',
      });
      setSearchParams({});
    }
  }, [searchParams, setSearchParams, toast]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    const success = await submitProfile(formData, selectedSkills, avatarFile, portfolioPaths, true);
    if (success) {
      setAvatarFile(null);
    }
  };

  return (
    <DashboardLayout userRole="content_creator">
      <div className="min-h-screen bg-white overflow-x-hidden pb-24">
        {/* Template C header */}
        <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center">
          <div className="flex-1 text-center">
            <h1 className="font-sans text-base font-bold text-gray-900 uppercase tracking-wide">Settings</h1>
          </div>
        </div>
        <div className="p-4">
          <CreatorSettingsHeader />
          <CreatorSettingsForm
            formData={formData}
            selectedSkills={selectedSkills}
            avatarFile={avatarFile}
            portfolioPaths={portfolioPaths}
            loading={loading}
            onInputChange={handleInputChange}
            onSkillChange={handleSkillChange}
            onAvatarFileChange={setAvatarFile}
            onPortfolioPathsChange={setPortfolioPaths}
            onSubmit={handleSubmit}
          />
        </div>
      </div>
    </DashboardLayout>
  );
};

export default CreatorSettings;
