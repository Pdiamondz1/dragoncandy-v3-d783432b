
import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EnhancedBusinessProfileForm } from './EnhancedBusinessProfileForm';
import { SocialMediaLinks } from './SocialMediaLinks';
import { FileUploadSection } from './FileUploadSection';
import type { BusinessProfileFormData } from '@/hooks/useBusinessProfileForm';

interface BusinessSettingsFormProps {
  formData: BusinessProfileFormData;
  logoFile: File | null;
  loading: boolean;
  onInputChange: (field: string, value: string) => void;
  onLogoChange: (file: File | null) => void;
  onSubmit: (e: React.FormEvent) => void;
}

export const BusinessSettingsForm = ({
  formData,
  logoFile,
  loading,
  onInputChange,
  onLogoChange,
  onSubmit
}: BusinessSettingsFormProps) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Business Profile</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-6">
          <EnhancedBusinessProfileForm 
            formData={formData}
            onInputChange={onInputChange}
          />

          <FileUploadSection
            logoFile={logoFile}
            sampleFiles={[]}
            onLogoChange={onLogoChange}
            onSampleFilesChange={() => {}}
          />

          <SocialMediaLinks 
            formData={formData}
            onInputChange={onInputChange}
          />

          <Button
            type="submit"
            className="bg-pink-600 hover:bg-pink-700"
            disabled={loading}
          >
            {loading ? 'Updating...' : 'Update Profile'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};
