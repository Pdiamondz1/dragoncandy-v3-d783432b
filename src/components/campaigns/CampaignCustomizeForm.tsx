
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
  goals: string;
  targetAudience: string;
  platforms: string[];
  timeline: string;
  style: string;
  tone: string;
  deliverables: string[];
  budgetRecommendation: string;
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
  const [formData, setFormData] = useState<CampaignData>(initialData);
  const [customPlatform, setCustomPlatform] = useState('');
  const [customDeliverable, setCustomDeliverable] = useState('');

  const availablePlatforms = [
    'Instagram', 'TikTok', 'YouTube', 'Facebook', 'X (Twitter)', 
    'LinkedIn', 'Pinterest', 'Snapchat', 'YouTube Shorts'
  ];

  const availableDeliverables = [
    '10 Instagram posts (mix of carousel and single image)',
    '5 Instagram Stories',
    '3 Instagram Reels',
    '5 TikTok videos',
    '1 influencer collaboration on Instagram',
    '1 influencer collaboration on TikTok',
    'YouTube video content',
    'Blog post content',
    'User-generated content campaign'
  ];

  useEffect(() => {
    setFormData(initialData);
  }, [initialData]);

  const handleInputChange = (field: keyof CampaignData, value: string) => {
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

  const removeDeliverable = (deliverableToRemove: string) => {
    setFormData(prev => ({
      ...prev,
      deliverables: prev.deliverables.filter(deliverable => deliverable !== deliverableToRemove)
    }));
  };

  const addDeliverable = (deliverable: string) => {
    if (deliverable && !formData.deliverables.includes(deliverable)) {
      setFormData(prev => ({
        ...prev,
        deliverables: [...prev.deliverables, deliverable]
      }));
    }
  };

  const addCustomDeliverable = () => {
    if (customDeliverable.trim() && !formData.deliverables.includes(customDeliverable.trim())) {
      addDeliverable(customDeliverable.trim());
      setCustomDeliverable('');
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
        {/* Campaign Name and Tone */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Campaign Name</label>
            <Input
              value={formData.title}
              onChange={(e) => handleInputChange('title', e.target.value)}
              placeholder="Enter campaign name"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Tone</label>
            <Input
              value={formData.tone}
              onChange={(e) => handleInputChange('tone', e.target.value)}
              placeholder="e.g., Authentic, engaging, and aspirational"
            />
          </div>
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

        {/* Style */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Style</label>
          <Textarea
            value={formData.style}
            onChange={(e) => handleInputChange('style', e.target.value)}
            className="min-h-[80px] resize-none"
            placeholder="Describe the visual style and aesthetic..."
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

        {/* Deliverables */}
        <div className="space-y-3">
          <label className="text-sm font-medium text-gray-700">Deliverables</label>
          <div className="space-y-2">
            {formData.deliverables.map((deliverable, index) => (
              <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <span className="text-sm text-gray-700">{deliverable}</span>
                <button
                  type="button"
                  onClick={() => removeDeliverable(deliverable)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
          <div className="space-y-2">
            <Select onValueChange={addDeliverable}>
              <SelectTrigger>
                <SelectValue placeholder="Select a deliverable to add" />
              </SelectTrigger>
              <SelectContent>
                {availableDeliverables
                  .filter(deliverable => !formData.deliverables.includes(deliverable))
                  .map((deliverable) => (
                    <SelectItem key={deliverable} value={deliverable}>
                      {deliverable}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              <Input
                value={customDeliverable}
                onChange={(e) => setCustomDeliverable(e.target.value)}
                placeholder="Add custom deliverable"
                className="flex-1"
              />
              <Button type="button" onClick={addCustomDeliverable} size="sm">
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
