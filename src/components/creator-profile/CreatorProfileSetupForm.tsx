
import React from 'react';
import { Button } from '@/components/ui/button';
import { EnhancedCreatorProfileForm } from './EnhancedCreatorProfileForm';
import { CreatorSocialMediaLinks } from './CreatorSocialMediaLinks';
import { PortfolioUpload } from './PortfolioUpload';
import { AvatarUpload } from './AvatarUpload';
import { SkillsSelection } from './SkillsSelection';
import type { CreatorProfileFormData } from '@/hooks/useCreatorProfileForm';
import type { Database } from '@/integrations/supabase/types';

type CreatorSkill = Database['public']['Enums']['creator_skill'];

interface CreatorProfileSetupFormProps {
  formData: CreatorProfileFormData;
  selectedSkills: CreatorSkill[];
  avatarFile: File | null;
  portfolioPaths: string[];
  loading: boolean;
  isFormValid: boolean;
  onInputChange: (field: string, value: string) => void;
  onSkillChange: (skillId: CreatorSkill, checked: boolean) => void;
  onAvatarFileChange: (file: File | null) => void;
  onPortfolioPathsChange: (paths: string[]) => void;
  onSubmit: (e: React.FormEvent) => void;
}

export const CreatorProfileSetupForm = ({
  formData,
  selectedSkills,
  avatarFile,
  portfolioPaths,
  loading,
  isFormValid,
  onInputChange,
  onSkillChange,
  onAvatarFileChange,
  onPortfolioPathsChange,
  onSubmit
}: CreatorProfileSetupFormProps) => {
  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <EnhancedCreatorProfileForm 
        formData={formData}
        onInputChange={onInputChange}
      />

      <AvatarUpload 
        avatarFile={avatarFile}
        onAvatarFileChange={onAvatarFileChange}
      />

      <SkillsSelection 
        selectedSkills={selectedSkills}
        onSkillChange={onSkillChange}
      />

      <CreatorSocialMediaLinks 
        formData={formData}
        onInputChange={onInputChange}
      />

      <PortfolioUpload 
        portfolioPaths={portfolioPaths}
        onPortfolioPathsChange={onPortfolioPathsChange}
      />

      <Button
        type="submit"
        className="w-full bg-pink-600 hover:bg-pink-700"
        disabled={loading || !isFormValid}
      >
        {loading ? 'Creating Profile...' : 'Complete Profile Setup'}
      </Button>
    </form>
  );
};
