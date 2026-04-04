
import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { CampaignAnalysis, CampaignData, CampaignCustomizeFormProps } from '@/types/campaign';
import CampaignBasicFields from './CampaignBasicFields';
import PlatformSelector from './PlatformSelector';
import ContentTypeSelector from './ContentTypeSelector';

const CampaignCustomizeForm: React.FC<CampaignCustomizeFormProps> = ({
  initialData,
  onContinue,
  onBackToAnalysis,
}) => {
  const [formData, setFormData] = useState<CampaignData>({
    title: initialData.title || '',
    description: initialData.description || '',
    goals: initialData.goals || [],
    target_audience: initialData.target_audience || '',
    platforms: initialData.recommended_platforms || [],
    content_types: initialData.content_types || [],
    key_messages: initialData.key_messages || [],
    timeline_recommendations: initialData.timeline_recommendations,
    budget_recommendations: initialData.budget_recommendations,
  });

  useEffect(() => {
    setFormData({
      title: initialData.title || '',
      description: initialData.description || '',
      goals: initialData.goals || [],
      target_audience: initialData.target_audience || '',
      platforms: initialData.recommended_platforms || [],
      content_types: initialData.content_types || [],
      key_messages: initialData.key_messages || [],
      timeline_recommendations: initialData.timeline_recommendations,
      budget_recommendations: initialData.budget_recommendations,
    });
  }, [initialData]);

  const handleInputChange = (field: keyof CampaignData, value: string | string[]) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onContinue(formData);
  };

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="space-y-6">
        <CampaignBasicFields
          title={formData.title}
          description={formData.description}
          targetAudience={formData.target_audience}
          onTitleChange={(value) => handleInputChange('title', value)}
          onDescriptionChange={(value) => handleInputChange('description', value)}
          onTargetAudienceChange={(value) => handleInputChange('target_audience', value)}
        />

        <PlatformSelector
          platforms={formData.platforms}
          onPlatformsChange={(platforms) => handleInputChange('platforms', platforms)}
        />

        <ContentTypeSelector
          contentTypes={formData.content_types}
          onContentTypesChange={(contentTypes) => handleInputChange('content_types', contentTypes)}
        />

        {/* Action Buttons */}
        <div className="flex flex-wrap justify-between gap-2 pt-6">
          <Button type="button" variant="outline" onClick={onBackToAnalysis}>
            Back to Analysis
          </Button>
          <Button type="submit" className="bg-gray-900 hover:bg-gray-800 text-white">
            Continue
          </Button>
        </div>
      </form>
    </div>
  );
};

export default CampaignCustomizeForm;
