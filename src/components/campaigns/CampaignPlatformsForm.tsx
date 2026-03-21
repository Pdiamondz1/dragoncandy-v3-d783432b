
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

interface CampaignPlatformsFormProps {
  formData: {
    platforms: string[];
    deliverables: string[];
  };
  onArrayChange: (field: 'platforms' | 'deliverables', value: string, checked: boolean) => void;
}

const platformOptions = [
  'Instagram', 'TikTok', 'YouTube', 'Facebook', 'Twitter/X', 'LinkedIn', 'Pinterest', 'Snapchat'
];

const deliverableOptions = [
  'Social Media Posts', 'Stories', 'Reels/Short Videos', 'Long-form Videos', 'Photography', 
  'Blog Posts', 'Product Reviews', 'Unboxing Videos', 'Tutorials', 'Live Streams'
];

const CampaignPlatformsForm: React.FC<CampaignPlatformsFormProps> = ({
  formData,
  onArrayChange,
}) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Platforms & Deliverables</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <Label className="text-base font-medium">Target Platforms</Label>
          <p className="text-sm text-gray-600 mb-3">Select the platforms where content will be published</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {platformOptions.map((platform) => (
              <div key={platform} className="flex items-center space-x-2">
                <Checkbox
                  id={`platform-${platform}`}
                  checked={formData.platforms.includes(platform)}
                  onCheckedChange={(checked) => 
                    onArrayChange('platforms', platform, checked as boolean)
                  }
                />
                <Label htmlFor={`platform-${platform}`} className="text-sm">
                  {platform}
                </Label>
              </div>
            ))}
          </div>
        </div>

        <div>
          <Label className="text-base font-medium">Deliverables</Label>
          <p className="text-sm text-gray-600 mb-3">What type of content do you need?</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {deliverableOptions.map((deliverable) => (
              <div key={deliverable} className="flex items-center space-x-2">
                <Checkbox
                  id={`deliverable-${deliverable}`}
                  checked={formData.deliverables.includes(deliverable)}
                  onCheckedChange={(checked) => 
                    onArrayChange('deliverables', deliverable, checked as boolean)
                  }
                />
                <Label htmlFor={`deliverable-${deliverable}`} className="text-sm">
                  {deliverable}
                </Label>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default CampaignPlatformsForm;
