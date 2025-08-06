
import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CreatorProfileSetupHeader } from '@/components/creator-profile/CreatorProfileSetupHeader';
import { CreatorProfileSetupForm } from '@/components/creator-profile/CreatorProfileSetupForm';
import { useCreatorProfileForm } from '@/hooks/useCreatorProfileForm';
import { useCreatorProfileSubmit } from '@/hooks/useCreatorProfileSubmit';

const CreatorProfileSetup = () => {
  const { user, signOut } = useAuth();
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
    const success = await submitProfile(formData, selectedSkills, avatarFile, portfolioFiles);
    
    // Redirect to creator dashboard on successful profile creation
    if (success) {
      navigate('/dashboard/creator');
    }
  };

  return (
    <div className="min-h-screen bg-pink-50 py-8">
      <div className="max-w-2xl mx-auto px-4">
        {/* Header with logout button */}
        <div className="text-center mb-8 relative">
          <Button
            variant="outline"
            onClick={signOut}
            className="absolute top-0 right-0 text-gray-600 hover:text-gray-900"
          >
            Logout
          </Button>
          <CreatorProfileSetupHeader />
        </div>

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
