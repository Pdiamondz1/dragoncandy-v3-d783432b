import React from 'react';
import { SocialPostPrompt } from './SocialPostPrompt';
import { DragonCandyOutstandProvider } from '@/integrations/outstand/Provider';

interface CrossPostPromptProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId?: string;
  campaignTitle: string;
  creatorName: string;
  mediaUrls: string[];
  originalCaption: string;
}

export const CrossPostPrompt: React.FC<CrossPostPromptProps> = ({
  open,
  onOpenChange,
  campaignId,
  campaignTitle,
  creatorName,
  mediaUrls,
  originalCaption,
}) => (
  <SocialPostPrompt
    open={open}
    onOpenChange={onOpenChange}
    campaignId={campaignId}
    campaignTitle={campaignTitle}
    creatorName={creatorName}
    mediaUrls={mediaUrls}
    originalCaption={originalCaption}
    userRole="creator"
  />
);
