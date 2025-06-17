
import React from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { CreatorSettingsHeader } from '@/components/creator-profile/CreatorSettingsHeader';
import { CreatorSettingsForm } from '@/components/creator-profile/CreatorSettingsForm';
import { useCreatorProfileForm } from '@/hooks/useCreatorProfileForm';
import { useCreatorProfileLoad } from '@/hooks/useCreatorProfileLoad';
import { useCreatorProfileSubmit } from '@/hooks/useCreatorProfileSubmit';

const CreatorSettings = () => {
  const { submitProfile, loading } = useCreatorProfileSubmit();
  
  const {
    formData,
    avatarFile,
    selectedSkills,
    handleInputChange,
    handleSkillChange,
    setAvatarFile,
    setFormDataFromProfile
  } = useCreatorProfileForm();

  const { user } = useCreatorProfileLoad(setFormDataFromProfile);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    const success = await submitProfile(formData, selectedSkills, avatarFile, []);
    if (success) {
      setAvatarFile(null);
    }
  };

  return (
    <DashboardLayout userRole="content_creator">
      <div className="flex-1 p-8">
        <div className="max-w-2xl">
          <CreatorSettingsHeader />
          <CreatorSettingsForm
            formData={formData}
            selectedSkills={selectedSkills}
            avatarFile={avatarFile}
            loading={loading}
            onInputChange={handleInputChange}
            onSkillChange={handleSkillChange}
            onAvatarFileChange={setAvatarFile}
            onSubmit={handleSubmit}
          />
        </div>
      </div>
    </DashboardLayout>
  );
};

export default CreatorSettings;
