
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { X, Plus } from 'lucide-react';

interface CampaignData {
  title: string;
  description: string;
  goals: string[];
  target_audience: string;
  platforms: string[];
  content_types: string[];
  key_messages: string[];
  timeline_recommendations?: {
    preparation: string;
    execution: string;
    analysis: string;
  };
  budget_recommendations?: {
    min: number;
    max: number;
    reasoning: string;
  };
}

interface CampaignCustomizeFormProps {
  initialData: CampaignData;
  onContinue: (data: CampaignData) => void;
  onBackToAnalysis: () => void;
}

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
    platforms: initialData.recommended_platforms || initialData.platforms || [],
    content_types: initialData.content_types || [],
    key_messages: initialData.key_messages || [],
    timeline_recommendations: initialData.timeline_recommendations,
    budget_recommendations: initialData.budget_recommendations,
  });
  
  const [customPlatform, setCustomPlatform] = useState('');
  const [customContentType, setCustomContentType] = useState('');

  const availablePlatforms = [
    'Instagram', 'TikTok', 'YouTube', 'Facebook', 'X (Twitter)', 
    'LinkedIn', 'Pinterest', 'Snapchat', 'YouTube Shorts'
  ];

  const availableContentTypes = [
    'Video', 'Image', 'Story', 'Reel', 'Post', 'Carousel', 
    'Blog Content', 'User-Generated Content', 'Influencer Collaboration'
  ];

  useEffect(() => {
    setFormData({
      title: initialData.title || '',
      description: initialData.description || '',
      goals: initialData.goals || [],
      target_audience: initialData.target_audience || '',
      platforms: initialData.recommended_platforms || initialData.platforms || [],
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

  const removePlatform = (platformToRemove: string) => {
    setFormData(prev => ({
      ...prev,
      platforms: prev.platforms.filter(platform => platform !== platformToRemove)
    }));
  };

  const addPlatform = (platform: string) => {
    if (platform && !formData.platforms.includes(platform)) {
      setFormData(prev => ({
        ...prev,
        platforms: [...prev.platforms, platform]
      }));
    }
  };

  const addCustomPlatform = () => {
    if (customPlatform.trim() && !formData.platforms.includes(customPlatform.trim())) {
      addPlatform(customPlatform.trim());
      setCustomPlatform('');
    }
  };

  const removeContentType = (typeToRemove: string) => {
    setFormData(prev => ({
      ...prev,
      content_types: prev.content_types.filter(type => type !== typeToRemove)
    }));
  };

  const addContentType = (type: string) => {
    if (type && !formData.content_types.includes(type)) {
      setFormData(prev => ({
        ...prev,
        content_types: [...prev.content_types, type]
      }));
    }
  };

  const addCustomContentType = () => {
    if (customContentType.trim() && !formData.content_types.includes(customContentType.trim())) {
      addContentType(customContentType.trim());
      setCustomContentType('');
    }
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
        {/* Campaign Name */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Campaign Name</label>
          <Input
            value={formData.title}
            onChange={(e) => handleInputChange('title', e.target.value)}
            placeholder="Enter campaign name"
          />
        </div>

        {/* Description */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Description</label>
          <Textarea
            value={formData.description}
            onChange={(e) => handleInputChange('description', e.target.value)}
            className="min-h-[120px] resize-none"
            placeholder="Describe your campaign..."
          />
        </div>

        {/* Target Audience */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Target Audience</label>
          <Textarea
            value={formData.target_audience}
            onChange={(e) => handleInputChange('target_audience', e.target.value)}
            className="min-h-[80px] resize-none"
            placeholder="Describe your target audience..."
          />
        </div>

        {/* Platforms */}
        <div className="space-y-3">
          <label className="text-sm font-medium text-gray-700">Platforms</label>
          <div className="flex flex-wrap gap-2 mb-3">
            {formData.platforms.map((platform, index) => (
              <Badge key={index} variant="secondary" className="flex items-center gap-1">
                {platform}
                <button
                  type="button"
                  onClick={() => removePlatform(platform)}
                  className="ml-1 text-gray-500 hover:text-gray-700"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
          <div className="space-y-2">
            <Select onValueChange={addPlatform}>
              <SelectTrigger>
                <SelectValue placeholder="Select a platform to add" />
              </SelectTrigger>
              <SelectContent>
                {availablePlatforms
                  .filter(platform => !formData.platforms.includes(platform))
                  .map((platform) => (
                    <SelectItem key={platform} value={platform}>
                      {platform}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              <Input
                value={customPlatform}
                onChange={(e) => setCustomPlatform(e.target.value)}
                placeholder="Add custom platform"
                className="flex-1"
              />
              <Button type="button" onClick={addCustomPlatform} size="sm">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Content Types */}
        <div className="space-y-3">
          <label className="text-sm font-medium text-gray-700">Content Types</label>
          <div className="flex flex-wrap gap-2 mb-3">
            {formData.content_types.map((type, index) => (
              <Badge key={index} variant="secondary" className="flex items-center gap-1">
                {type}
                <button
                  type="button"
                  onClick={() => removeContentType(type)}
                  className="ml-1 text-gray-500 hover:text-gray-700"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
          <div className="space-y-2">
            <Select onValueChange={addContentType}>
              <SelectTrigger>
                <SelectValue placeholder="Select a content type to add" />
              </SelectTrigger>
              <SelectContent>
                {availableContentTypes
                  .filter(type => !formData.content_types.includes(type))
                  .map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              <Input
                value={customContentType}
                onChange={(e) => setCustomContentType(e.target.value)}
                placeholder="Add custom content type"
                className="flex-1"
              />
              <Button type="button" onClick={addCustomContentType} size="sm">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

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
