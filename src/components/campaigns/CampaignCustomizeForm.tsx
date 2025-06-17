
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gray-900 rounded-full flex items-center justify-center text-white text-sm font-semibold">
              3
            </div>
            Step 3: Customize Campaign Structure
          </CardTitle>
        </CardHeader>
      </Card>

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
        <div className="flex justify-between pt-6">
          <Button type="button" variant="outline" onClick={onBackToAnalysis}>
            Back to Analysis
          </Button>
          <Button type="submit" className="bg-gray-900 hover:bg-gray-800 text-white">
            Continue to Timeline & Budget
          </Button>
        </div>
      </form>
    </div>
  );
};

export default CampaignCustomizeForm;
