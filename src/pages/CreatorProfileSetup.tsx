
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useLogout } from '@/hooks/useLogout';
import { ChevronLeft } from 'lucide-react';
import { CreatorProfileSetupForm } from '@/components/creator-profile/CreatorProfileSetupForm';
import { useCreatorProfileForm } from '@/hooks/useCreatorProfileForm';
import { useCreatorProfileSubmit } from '@/hooks/useCreatorProfileSubmit';

const CreatorProfileSetup = () => {
  const { user } = useAuth();
  const logout = useLogout();
  const navigate = useNavigate();
  const { submitProfile, loading } = useCreatorProfileSubmit();
  const [avatarUrl, setAvatarUrl] = useState('');

  const {
    formData,
    avatarFile,
    portfolioPaths,
    selectedSkills,
    handleInputChange,
    handleSkillChange,
    setAvatarFile,
    setPortfolioPaths,
    isFormValid
  } = useCreatorProfileForm();

  useEffect(() => {
    if (!user) {
      navigate('/auth');
    }
  }, [user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const success = await submitProfile(
      formData,
      selectedSkills,
      avatarFile,
      portfolioPaths,
      false,
      avatarUrl || undefined
    );

    // Redirect to creator dashboard on successful profile creation
    if (success) {
      navigate('/dashboard/creator');
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
          Creator Profile Setup
        </h1>
        <div className="w-7" />
      </div>

      {/* Form Content */}
      <div className="px-4 py-6 pb-24 md:pb-0 max-w-2xl mx-auto">
        <p className="text-sm text-gray-500 mb-6">
          Showcase your skills and start getting discovered by brands.
        </p>

        <CreatorProfileSetupForm
          formData={formData}
          selectedSkills={selectedSkills}
          avatarFile={avatarFile}
          portfolioPaths={portfolioPaths}
          loading={loading}
          isFormValid={isFormValid()}
          onInputChange={handleInputChange}
          onSkillChange={handleSkillChange}
          onAvatarFileChange={setAvatarFile}
          onPortfolioPathsChange={setPortfolioPaths}
          onSubmit={handleSubmit}
          avatarUrl={avatarUrl}
          onAvatarUrlChange={setAvatarUrl}
        />
      </div>
    </div>
  );
};

export default CreatorProfileSetup;
