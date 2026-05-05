import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Lightbulb, Sparkles, Loader2, ArrowRight } from 'lucide-react';
import { ContentSourceSelector } from './ContentSourceSelector';
import { MediaUploader } from './MediaUploader';
import type { ContentSource, StagedFile } from '@/types/campaignMedia';

interface CampaignBriefStepProps {
  campaignGoal: string;
  setCampaignGoal: (value: string) => void;
  contentSource: ContentSource;
  setContentSource: (value: ContentSource) => void;
  referenceMedia: StagedFile[];
  setReferenceMedia: (files: StagedFile[]) => void;
  rawFootage: StagedFile[];
  setRawFootage: (files: StagedFile[]) => void;
  onGenerateWithAI: () => void;
  isGenerating: boolean;
  hasAnalysis?: boolean;
  onNext: () => void;
}

export const CampaignBriefStep: React.FC<CampaignBriefStepProps> = ({
  campaignGoal,
  setCampaignGoal,
  contentSource,
  setContentSource,
  referenceMedia,
  setReferenceMedia,
  rawFootage,
  setRawFootage,
  onGenerateWithAI,
  isGenerating,
  hasAnalysis = false,
  onNext,
}) => {
  const showRawFootage = contentSource === 'business_footage' || contentSource === 'hybrid';

  return (
    <div className="space-y-4">
      {/* Campaign Goal Card */}
      <Card>
        <CardHeader>
          <CardTitle>Step 1: Describe Your Campaign Goal</CardTitle>
          <p className="text-gray-600 text-sm">Tell DragonCandy AI about your restaurant's content needs</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            placeholder="Example: We just launched a new weekend brunch menu at our downtown cafe and want to drive foot traffic. We need mouth-watering food photos and short-form video reels showcasing our signature dishes — think close-up shots of our avocado toast, latte art, and the cozy interior vibe. Target local foodies and brunch lovers on Instagram and TikTok within a 15-mile radius. Budget is around $200-500 and we'd love content ready by this weekend."
            value={campaignGoal}
            onChange={(e) => setCampaignGoal(e.target.value)}
            className="min-h-[150px] resize-none"
          />
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Lightbulb className="h-4 w-4 text-yellow-500" />
            Be specific about your dishes, vibe, target audience, preferred platforms, budget range, and timeline for the best results.
          </div>
          <Button
            onClick={onGenerateWithAI}
            disabled={!campaignGoal.trim() || isGenerating}
            className="w-full bg-pink-500 hover:bg-pink-600 text-white"
          >
            {isGenerating ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 mr-2" />
            )}
            {isGenerating ? 'Generating…' : 'Generate Campaign with DragonCandy AI'}
          </Button>
        </CardContent>
      </Card>

      {/* Content Source Section */}
      <Card>
        <CardContent className="pt-6 space-y-3">
          <p className="text-sm font-semibold text-gray-900">How will content be created?</p>
          <ContentSourceSelector value={contentSource} onChange={setContentSource} />
        </CardContent>
      </Card>

      {/* Reference Media Section */}
      <Card>
        <CardContent className="pt-6 space-y-3">
          <p className="text-sm font-semibold text-gray-900">
            Show creators what you're looking for
            <span className="text-xs text-gray-400 font-normal ml-1">(Optional)</span>
          </p>
          <p className="text-xs text-gray-500">
            Upload example photos or short clips that show the style, vibe, or specific items you want featured
          </p>
          <MediaUploader
            mediaType="reference_image"
            maxFiles={5}
            onFilesChange={setReferenceMedia}
            existingFiles={referenceMedia}
          />
        </CardContent>
      </Card>

      {/* Raw Footage Section — only visible for business_footage or hybrid */}
      {showRawFootage && (
        <Card>
          <CardContent className="pt-6 space-y-3">
            <p className="text-sm font-semibold text-gray-900">Upload your footage for the creator</p>
            <p className="text-xs text-gray-500">
              Upload raw photos or video clips you want the creator to edit, enhance, and publish. The creator will handle editing, captions, music, and posting.
            </p>
            <MediaUploader
              mediaType="raw_footage"
              maxFiles={10}
              onFilesChange={setRawFootage}
              existingFiles={rawFootage}
            />
          </CardContent>
        </Card>
      )}

      {/* Next Button — only shown after AI generation */}
      {hasAnalysis && (
        <Button
          onClick={onNext}
          className="w-full bg-dc-teal hover:bg-dc-teal/90 text-white rounded-full"
        >
          Next
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      )}
    </div>
  );
};

