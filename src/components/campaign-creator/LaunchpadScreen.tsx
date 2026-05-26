import { Link } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import type { CampaignIdea, EditableCampaign, BrandFields } from '@/types/campaignCreator';
import { IdeaCarousel } from './IdeaCarousel';
import { RegenerateButton } from './RegenerateButton';
import { CampaignEditor } from './CampaignEditor';
import { LaunchButton } from './LaunchButton';
import { ExtractionFeed } from './ExtractionFeed';

interface LaunchpadScreenProps {
  ideas: CampaignIdea[];
  selectedIdeaId: string | null;
  editedCampaign: EditableCampaign | null;
  brandFields: BrandFields | null;
  userRole: 'business_client' | 'brand' | null;
  isExtracting: boolean;
  extractionMessages: string[];
  isAuthenticated: boolean;
  isLaunching: boolean;
  onSelectIdea: (id: string) => void;
  onRegenerate: () => void;
  updateField: <K extends keyof EditableCampaign>(field: K, value: EditableCampaign[K]) => void;
  updateBrandField: <K extends keyof BrandFields>(field: K, value: BrandFields[K]) => void;
  onLaunch: () => Promise<void>;
  onSaveDraft: () => Promise<void>;
  onAuthRequired: () => void;
}

export function LaunchpadScreen({
  ideas, selectedIdeaId, editedCampaign, brandFields, userRole,
  isExtracting, extractionMessages, isAuthenticated, isLaunching,
  onSelectIdea, onRegenerate, updateField, updateBrandField,
  onLaunch, onSaveDraft, onAuthRequired,
}: LaunchpadScreenProps) {
  const selectedIdea = ideas.find((i) => i.id === selectedIdeaId);
  const noPlatformsConnected = ideas.length > 0 && ideas.every(i => i.content_strategy === null);
  const settingsPath = userRole === 'brand' ? '/dashboard/brand/settings' : '/dashboard/business/settings';

  return (
    <div className="space-y-4 px-4 pb-8">
      <ExtractionFeed messages={extractionMessages} isExtracting={isExtracting} />
      <IdeaCarousel ideas={ideas} selectedId={selectedIdeaId} onSelect={onSelectIdea} />
      {noPlatformsConnected && (
        <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl p-3">
          <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs text-amber-800 font-semibold">No social accounts connected</p>
            <p className="text-[11px] text-amber-700 mt-0.5">
              Connect a social account in Settings to unlock auto-scheduling and content strategy.
            </p>
            <Link to={settingsPath} className="text-[11px] text-amber-600 font-semibold hover:underline mt-1 inline-block">
              Go to Settings →
            </Link>
          </div>
        </div>
      )}
      <div className="flex justify-center">
        <RegenerateButton onRegenerate={onRegenerate} isLoading={isExtracting} />
      </div>
      {editedCampaign && selectedIdea && (
        <>
          <CampaignEditor
            campaign={editedCampaign}
            originalIdea={selectedIdea}
            brandFields={brandFields}
            userRole={userRole}
            updateField={updateField}
            updateBrandField={updateBrandField}
          />
          <LaunchButton
            onLaunch={onLaunch}
            onSaveDraft={onSaveDraft}
            isAuthenticated={isAuthenticated}
            isLaunching={isLaunching}
            onAuthRequired={onAuthRequired}
          />
        </>
      )}
    </div>
  );
}
