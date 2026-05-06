
import React from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

interface CampaignBasicFieldsProps {
  title: string;
  description: string;
  targetAudience: string;
  onTitleChange: (title: string) => void;
  onDescriptionChange: (description: string) => void;
  onTargetAudienceChange: (targetAudience: string) => void;
}

export const CampaignBasicFields: React.FC<CampaignBasicFieldsProps> = ({
  title,
  description,
  targetAudience,
  onTitleChange,
  onDescriptionChange,
  onTargetAudienceChange,
}) => {
  return (
    <>
      {/* Campaign Name */}
      <div className="space-y-2">
        <label htmlFor="campaign-name" className="text-sm font-medium text-gray-700">Campaign Name</label>
        <Input
          id="campaign-name"
          name="campaign-name"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="Enter campaign name"
        />
      </div>

      {/* Description */}
      <div className="space-y-2">
        <label htmlFor="campaign-description" className="text-sm font-medium text-gray-700">Description</label>
        <Textarea
          id="campaign-description"
          name="campaign-description"
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          className="min-h-[120px] resize-none"
          placeholder="Describe your campaign…"
        />
      </div>

      {/* Target Audience */}
      <div className="space-y-2">
        <label htmlFor="target-audience" className="text-sm font-medium text-gray-700">Target Audience</label>
        <Textarea
          id="target-audience"
          name="target-audience"
          value={targetAudience}
          onChange={(e) => onTargetAudienceChange(e.target.value)}
          className="min-h-[80px] resize-none"
          placeholder="Describe your target audience…"
        />
      </div>
    </>
  );
};

