import { useState } from 'react';
import { Info } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { DeliveryTier, StagedFile, Deliverable } from '@/types/campaignMedia';
import { TIER_LIMITS } from '@/types/campaignMedia';
import { MediaUploader } from '@/components/campaigns/MediaUploader';
import DeliverableBuilder from '@/components/campaigns/DeliverableBuilder';
import { Button } from '@/components/ui/button';

interface CampaignVisualsStepProps {
  deliveryTier: DeliveryTier;
  referenceMedia: StagedFile[];
  onReferenceMediaChange: (files: StagedFile[]) => void;
  rawFootage: StagedFile[];
  onRawFootageChange: (files: StagedFile[]) => void;
  deliverables: Deliverable[];
  onDeliverablesChange: (deliverables: Deliverable[]) => void;
  onContinue: () => void;
  onBack: () => void;
}

export function CampaignVisualsStep({
  deliveryTier,
  referenceMedia,
  onReferenceMediaChange,
  rawFootage,
  onRawFootageChange,
  deliverables,
  onDeliverablesChange,
  onContinue,
  onBack,
}: CampaignVisualsStepProps) {
  const [showFootage, setShowFootage] = useState(rawFootage.length > 0);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});

  return (
    <div className="space-y-4">
      {/* Section A — Visual References */}
      <div className="bg-white rounded-2xl p-5 space-y-4">
        <div>
          <h3 className="text-base font-extrabold text-gray-900">
            Show creators what you're looking for
          </h3>
          <p className="text-sm text-gray-500">
            Upload example images or short reels that match your vision
          </p>
        </div>
        <MediaUploader
          mediaType="reference_image"
          maxFiles={5}
          onFilesChange={onReferenceMediaChange}
          existingFiles={referenceMedia}
          uploadProgress={uploadProgress}
        />
        <p className="text-xs text-gray-400 mt-1">
          Reference media is used during campaign creation and will be removed after the campaign completes. Delivered content from creators is kept permanently.
        </p>
      </div>

      {/* Section B — Raw Footage Toggle */}
      <div className="bg-white rounded-2xl p-5">
        <div className="flex items-center justify-between">
          <span className="text-base font-extrabold text-gray-900">
            I have footage for the creator to use
          </span>
          <button
            type="button"
            onClick={() => setShowFootage(!showFootage)}
            className={`relative w-11 h-6 rounded-full transition-colors ${showFootage ? 'bg-dc-teal' : 'bg-gray-300'}`}
          >
            <span
              className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${showFootage ? 'translate-x-5' : 'translate-x-0.5'}`}
            />
          </button>
        </div>
        {showFootage && (
          <div className="mt-4 space-y-2">
            <p className="text-sm text-gray-500">
              Raw footage the creator should use in the final content
            </p>
            <MediaUploader
              mediaType="raw_footage"
              maxFiles={10}
              onFilesChange={onRawFootageChange}
              existingFiles={rawFootage}
              maxTotalBytes={200 * 1024 * 1024}
              uploadProgress={uploadProgress}
            />
          </div>
        )}
      </div>

      {/* Section C — Content Deliverables */}
      <div className="bg-white rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-1">
          <h3 className="text-base font-extrabold text-gray-900">
            How many pieces of content do you need?
          </h3>
          {deliveryTier === 'dragondash' && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="w-4 h-4 text-gray-400 cursor-help" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>DragonDash rush orders support up to 2 deliverables</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
        <DeliverableBuilder
          deliverables={deliverables}
          onChange={onDeliverablesChange}
          maxDeliverables={TIER_LIMITS[deliveryTier].maxDeliverables}
          allowedContentTypes={[...TIER_LIMITS[deliveryTier].contentTypes]}
        />
      </div>

      {/* Navigation */}
      <div className="flex justify-between gap-2 pt-4">
        <Button type="button" variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button
          type="button"
          onClick={onContinue}
          className="bg-dc-teal hover:bg-dc-teal/90 text-white rounded-full px-8"
        >
          Continue to Review
        </Button>
      </div>
    </div>
  );
}

export default CampaignVisualsStep;
