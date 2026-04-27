import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import CampaignAIPreviewStep from '@/components/campaigns/CampaignAIPreviewStep';

interface BrandCampaignPreviewStepProps {
  onSaveDraft: () => Promise<string | null>;
  draftCampaignId: string | null;
  onApprove: () => void;
  onSkip: () => void;
  onBack: () => void;
}

export const BrandCampaignPreviewStep: React.FC<BrandCampaignPreviewStepProps> = ({
  onSaveDraft,
  draftCampaignId,
  onApprove,
  onSkip,
  onBack,
}) => {
  const [campaignId, setCampaignId] = useState<string | null>(draftCampaignId);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);

  const saveDraft = async () => {
    setIsSaving(true);
    setSaveError(false);
    try {
      const id = await onSaveDraft();
      if (id) {
        setCampaignId(id);
      } else {
        setSaveError(true);
      }
    } catch {
      setSaveError(true);
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    if (!campaignId) {
      saveDraft();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (isSaving) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-dc-teal" />
        <p className="text-sm text-gray-500 font-medium">Saving draft for preview...</p>
      </div>
    );
  }

  if (saveError || !campaignId) {
    return (
      <Card className="rounded-2xl border border-red-200">
        <CardContent className="flex flex-col items-center gap-4 py-8">
          <p className="text-sm text-red-600 font-medium">
            Failed to save draft. Please try again.
          </p>
          <div className="flex gap-3 w-full">
            <Button
              variant="outline"
              className="flex-1 rounded-full"
              onClick={onSkip}
            >
              Skip Preview
            </Button>
            <Button
              className="flex-1 rounded-full bg-dc-teal hover:bg-dc-teal/90 text-white"
              onClick={saveDraft}
            >
              Try Again
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <CampaignAIPreviewStep
      campaignId={campaignId}
      onApprove={onApprove}
      onSkip={onSkip}
      onBack={onBack}
    />
  );
};
