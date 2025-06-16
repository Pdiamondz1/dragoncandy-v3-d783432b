
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

interface CampaignBasicInfoFormProps {
  formData: {
    title: string;
    description: string;
    goals: string;
  };
  onInputChange: (field: string, value: string) => void;
}

const CampaignBasicInfoForm: React.FC<CampaignBasicInfoFormProps> = ({
  formData,
  onInputChange,
}) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Basic Information</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label htmlFor="title">Campaign Title *</Label>
          <Input
            id="title"
            value={formData.title}
            onChange={(e) => onInputChange('title', e.target.value)}
            placeholder="Enter campaign title"
          />
        </div>

        <div>
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            value={formData.description}
            onChange={(e) => onInputChange('description', e.target.value)}
            placeholder="Describe your campaign"
            rows={3}
          />
        </div>

        <div>
          <Label htmlFor="goals">Campaign Goals</Label>
          <Textarea
            id="goals"
            value={formData.goals}
            onChange={(e) => onInputChange('goals', e.target.value)}
            placeholder="What do you want to achieve with this campaign?"
            rows={3}
          />
        </div>
      </CardContent>
    </Card>
  );
};

export default CampaignBasicInfoForm;
