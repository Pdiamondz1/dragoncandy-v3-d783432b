import React, { useEffect } from 'react';
import { CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AppCard } from '@/components/app/AppCard';
import { Button } from '@/components/ui/button';
import { Loader2, Sparkles, RefreshCw, ArrowLeft, ArrowRight, SkipForward } from 'lucide-react';
import { useDonnyPreview, extractMoodBoard, extractStoryboard } from '@/hooks/useDonnyPreview';
import { MoodBoard } from './MoodBoard';
import { Storyboard } from './Storyboard';

interface CampaignAIPreviewStepProps {
  campaignId: string;
  onApprove: () => void;
  onSkip: () => void;
  onBack: () => void;
}

export const CampaignAIPreviewStep: React.FC<CampaignAIPreviewStepProps> = ({
  campaignId,
  onApprove,
  onSkip,
  onBack,
}) => {
  const mutation = useDonnyPreview();

  useEffect(() => {
    mutation.mutate({ campaignId, previewTypes: ['mood_board', 'storyboard'] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRegenerate = () => {
    mutation.reset();
    mutation.mutate({ campaignId, previewTypes: ['mood_board', 'storyboard'] });
  };

  // Loading state
  if (mutation.isPending) {
    return (
      <AppCard className="p-0">
        <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-teal-400" aria-hidden="true" />
          <p className="text-base font-semibold text-gray-800">
            Donny is creating a visual preview of your campaign…
          </p>
          <p className="text-sm text-gray-500">This may take a moment</p>
        </CardContent>
      </AppCard>
    );
  }

  // Error state
  if (mutation.isError) {
    return (
      <AppCard className="p-0">
        <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
          <Sparkles className="h-10 w-10 text-red-400" aria-hidden="true" />
          <p className="text-base font-semibold text-gray-800">
            Something went wrong generating your preview.
          </p>
          <p className="text-sm text-red-500">
            {mutation.error instanceof Error
              ? mutation.error.message
              : 'An unexpected error occurred.'}
          </p>
          <Button
            variant="outline"
            onClick={handleRegenerate}
            className="rounded-full flex items-center gap-2"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Try Again
          </Button>
        </CardContent>
      </AppCard>
    );
  }

  // Ready state
  if (mutation.isSuccess && mutation.data) {
    const previews = mutation.data.previews;
    const moodBoardData = extractMoodBoard(previews);
    const storyboardFrames = extractStoryboard(previews);

    return (
      <div className="space-y-6">
        <AppCard className="p-0">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-teal-400" aria-hidden="true" />
              AI Visual Preview
            </CardTitle>
          </CardHeader>
        </AppCard>

        {moodBoardData && (
          <MoodBoard
            title={moodBoardData.title}
            colorPalette={moodBoardData.color_palette}
            typography={moodBoardData.typography}
            layoutDescription={moodBoardData.layout_description}
            referenceDescriptions={moodBoardData.reference_descriptions}
          />
        )}

        {storyboardFrames.length > 0 && (
          <Storyboard frames={storyboardFrames} />
        )}

        {/* Regenerate row */}
        <div className="flex justify-center">
          <Button
            variant="outline"
            onClick={handleRegenerate}
            className="rounded-full flex items-center gap-2"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Regenerate Preview
          </Button>
        </div>

        {/* Navigation row: Back | Skip | Approve */}
        <div className="flex items-center justify-between gap-2">
          <Button
            variant="outline"
            onClick={onBack}
            className="rounded-full flex items-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={onSkip}
            className="rounded-full flex items-center gap-2 text-gray-500"
          >
            <SkipForward className="h-4 w-4" aria-hidden="true" />
            Skip Preview
          </Button>

          <Button
            onClick={onApprove}
            className="bg-dc-teal-btn hover:bg-dc-teal-btn-hover text-white rounded-full flex items-center gap-2"
          >
            Approve &amp; Continue
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </div>
    );
  }

  // Idle / not yet triggered (shouldn't normally be visible)
  return null;
};

