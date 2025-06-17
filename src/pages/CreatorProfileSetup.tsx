
import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CreatorProfileSetupHeader } from '@/components/creator-profile/CreatorProfileSetupHeader';
import { CreatorProfileSetupForm } from '@/components/creator-profile/CreatorProfileSetupForm';
import { useCreatorProfileForm } from '@/hooks/useCreatorProfileForm';
import { useCreatorProfileSubmit } from '@/hooks/useCreatorProfileSubmit';

const CreatorProfileSetup = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { submitProfile, loading } = useCreatorProfileSubmit();
  
  const {
    formData,
    avatarFile,
    portfolioFiles,
    selectedSkills,
    handleInputChange,
    handleSkillChange,
    setAvatarFile,
    setPortfolioFiles,
    isFormValid
  } = useCreatorProfileForm();

  useEffect(() => {
    if (!user) {
      navigate('/auth');
    }
  }, [user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitProfile(formData, selectedSkills, avatarFile, portfolioFiles);
  };

  return (
    <div className="min-h-screen bg-pink-50 py-8">
      <div className="max-w-2xl mx-auto px-4">
        <CreatorProfileSetupHeader />

        <Card>
          <CardHeader>
            <CardTitle>Creator Information</CardTitle>
          </CardHeader>
          <CardContent>
            <CreatorProfileSetupForm
              formData={formData}
              selectedSkills={selectedSkills}
              avatarFile={avatarFile}
              portfolioFiles={portfolioFiles}
              loading={loading}
              isFormValid={isFormValid()}
              onInputChange={handleInputChange}
              onSkillChange={handleSkillChange}
              onAvatarFileChange={setAvatarFile}
              onPortfolioFilesChange={setPortfolioFiles}
              onSubmit={handleSubmit}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default CreatorProfileSetup;
