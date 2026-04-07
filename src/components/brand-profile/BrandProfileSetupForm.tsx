import React from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BrandEnhancedProfileForm } from './BrandEnhancedProfileForm';
import { SocialMediaLinks } from '@/components/business-profile/SocialMediaLinks';
import { FileUploadSection } from '@/components/business-profile/FileUploadSection';
import type { BusinessProfileFormData } from '@/hooks/useBusinessProfileForm';

interface BrandProfileSetupFormProps {
  formData: BusinessProfileFormData;
  logoFile: File | null;
  loading: boolean;
  onInputChange: (field: string, value: string) => void;
  onLogoChange: (file: File | null) => void;
  onSubmit: (e: React.FormEvent) => void;
  logoUrl?: string;
  onLogoUrlChange?: (url: string) => void;
}

const brandCategories = [
  'Food & Beverage',
  'Retail & Fashion',
  'Technology',
  'Health & Wellness',
  'Automotive',
  'Entertainment',
  'Travel & Hospitality',
  'Financial Services',
  'Consumer Goods',
  'Other'
];

export const BrandProfileSetupForm = ({
  formData,
  logoFile,
  loading,
  onInputChange,
  onLogoChange,
  onSubmit,
  logoUrl,
  onLogoUrlChange,
}: BrandProfileSetupFormProps) => {
  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {/* Enhanced Brand Profile Fields */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Basic Information</h3>
        <BrandEnhancedProfileForm
          formData={formData}
          onInputChange={onInputChange}
        />
      </div>

      {/* Brand-specific fields */}
      <div className="space-y-4 border-t pt-6">
        <h3 className="text-lg font-semibold">Brand Details</h3>

        <div className="space-y-2">
          <Label htmlFor="brandCategory">Brand Category *</Label>
          <Select
            value={formData.brandCategory || ''}
            onValueChange={(value) => onInputChange('brandCategory', value)}
          >
            <SelectTrigger id="brandCategory">
              <SelectValue placeholder="Select your brand category" />
            </SelectTrigger>
            <SelectContent>
              {brandCategories.map((category) => (
                <SelectItem key={category} value={category}>
                  {category}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="marketingObjectives">Marketing Objectives *</Label>
          <Textarea
            id="marketingObjectives"
            placeholder="What are your key marketing goals? (e.g., brand awareness, product launches, local engagement)"
            value={formData.marketingObjectives || ''}
            onChange={(e) => onInputChange('marketingObjectives', e.target.value)}
            rows={4}
            required
          />
        </div>
      </div>

      {/* Logo upload */}
      <FileUploadSection
        logoFile={logoFile}
        sampleFiles={[]}
        onLogoChange={onLogoChange}
        onSampleFilesChange={() => {}}
        logoUrl={logoUrl}
        onLogoUrlChange={onLogoUrlChange}
      />

      {/* Social media links */}
      <SocialMediaLinks
        formData={formData}
        onInputChange={onInputChange}
      />

      <Button
        type="submit"
        className="w-full rounded-full bg-dc-teal text-white font-bold hover:bg-dc-teal/90"
        disabled={loading}
      >
        {loading ? 'Setting Up Profile...' : 'Complete Brand Profile'}
      </Button>
    </form>
  );
};
