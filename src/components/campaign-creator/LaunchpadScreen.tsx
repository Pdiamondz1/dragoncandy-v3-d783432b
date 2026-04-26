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

  return (
    <div className="space-y-4 px-4 pb-8">
      <ExtractionFeed messages={extractionMessages} isExtracting={isExtracting} />
      <IdeaCarousel ideas={ideas} selectedId={selectedIdeaId} onSelect={onSelectIdea} />
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
