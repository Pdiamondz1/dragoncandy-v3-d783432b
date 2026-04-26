import { useState } from 'react';
import { useCampaignCreator } from '@/hooks/useCampaignCreator';
import { useIsMobile } from '@/hooks/use-mobile';
import { DropScreen } from '@/components/campaign-creator/DropScreen';
import { LaunchpadScreen } from '@/components/campaign-creator/LaunchpadScreen';
import { CampaignPreviewCard } from '@/components/campaign-creator/CampaignPreviewCard';
import { AuthenticationModal } from '@/components/auth/AuthenticationModal';

export default function CampaignCreator() {
  const [showAuthModal, setShowAuthModal] = useState(false);
  const isMobile = useIsMobile();
  const {
    screen, isExtracting, extractionMessages, campaignIdeas, selectedIdeaId,
    editedCampaign, brandFields, userRole, isAuthenticated, isLaunching,
    submitInput, selectIdea, regenerateIdeas, updateField, updateBrandField,
    launchCampaign, saveDraft,
  } = useCampaignCreator();

  if (screen === 'drop') {
    return (
      <div className="min-h-screen bg-[#A8A8A0]">
        <DropScreen onSubmit={submitInput} isExtracting={isExtracting} extractionMessages={extractionMessages} />
      </div>
    );
  }

  // Screen 2: Launchpad — mobile layout
  if (isMobile || !editedCampaign) {
    return (
      <div className="min-h-screen bg-[#A8A8A0] pt-4">
        <LaunchpadScreen
          ideas={campaignIdeas || []}
          selectedIdeaId={selectedIdeaId}
          editedCampaign={editedCampaign}
          brandFields={brandFields}
          userRole={userRole}
          isExtracting={isExtracting}
          extractionMessages={extractionMessages}
          isAuthenticated={isAuthenticated}
          isLaunching={isLaunching}
          onSelectIdea={selectIdea}
          onRegenerate={regenerateIdeas}
          updateField={updateField}
          updateBrandField={updateBrandField}
          onLaunch={launchCampaign}
          onSaveDraft={saveDraft}
          onAuthRequired={() => setShowAuthModal(true)}
        />
        <AuthenticationModal
          isOpen={showAuthModal}
          onClose={() => setShowAuthModal(false)}
        />
      </div>
    );
  }

  // Desktop split view
  return (
    <div className="min-h-screen bg-[#A8A8A0]">
      <div className="flex gap-6 max-w-6xl mx-auto pt-6 px-6">
        <div className="flex-1 min-w-0">
          <LaunchpadScreen
            ideas={campaignIdeas || []}
            selectedIdeaId={selectedIdeaId}
            editedCampaign={editedCampaign}
            brandFields={brandFields}
            userRole={userRole}
            isExtracting={isExtracting}
            extractionMessages={extractionMessages}
            isAuthenticated={isAuthenticated}
            isLaunching={isLaunching}
            onSelectIdea={selectIdea}
            onRegenerate={regenerateIdeas}
            updateField={updateField}
            updateBrandField={updateBrandField}
            onLaunch={launchCampaign}
            onSaveDraft={saveDraft}
            onAuthRequired={() => setShowAuthModal(true)}
          />
        </div>
        <div className="w-80 flex-shrink-0 hidden md:block">
          <CampaignPreviewCard campaign={editedCampaign} />
        </div>
      </div>
      <AuthenticationModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
      />
    </div>
  );
}
