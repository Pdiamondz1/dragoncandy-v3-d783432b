import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useCampaignCreator } from '@/hooks/useCampaignCreator';
import { useFirstRunMissions } from '@/hooks/useFirstRunMissions';
import { useIsMobile } from '@/hooks/use-mobile';
import { PageBody } from '@/components/app/PageBody';
import { DropScreen } from '@/components/campaign-creator/DropScreen';
import { LaunchpadScreen } from '@/components/campaign-creator/LaunchpadScreen';
import { CampaignPreviewCard } from '@/components/campaign-creator/CampaignPreviewCard';
import { AuthenticationModal } from '@/components/auth/AuthenticationModal';
import { MobileBottomNav } from '@/components/MobileBottomNav';
import { DashboardLayout } from '@/components/DashboardLayout';
import { PrerequisiteGate } from '@/components/PrerequisiteGate';
import type { InspirationRef } from '@/types/firstRun';

export default function CampaignCreator() {
  const [showAuthModal, setShowAuthModal] = useState(false);
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { completeMission } = useFirstRunMissions();
  const {
    screen, inputMode, inputValue, isExtracting, extractionMessages, campaignIdeas, selectedIdeaId,
    editedCampaign, brandFields, userRole, isAuthenticated, isLaunching,
    submitInput, selectIdea, regenerateIdeas, updateField, updateBrandField,
    launchCampaign, saveDraft, setInspirationRefs, groupId, setGroupId,
  } = useCampaignCreator();

  // Text-mode briefs (the Donny-chat handoff) bypass the input box; seed it so
  // the brief is visible while generating and retryable if the run fails.
  const briefPrefill = inputMode === 'text' && inputValue ? inputValue : undefined;

  const handleInspirationChange = (refs: InspirationRef[]) => {
    setInspirationRefs(refs);
    if (refs.length > 0) completeMission('browse_inspiration');
  };

  const handleInspirationScrolled = () => completeMission('browse_inspiration');

  const handleLaunchCampaign = async () => {
    await launchCampaign();
    completeMission('launch_campaign');
  };

  // Trigger create_campaign mission when ideas are generated (screen transitions to launchpad)
  useEffect(() => {
    if (screen === 'launchpad') completeMission('create_campaign');
  }, [screen, completeMission]);

  const navRole = userRole || 'business_client';

  if (screen === 'drop') {
    if (isMobile) {
      return (
        <div className="min-h-screen bg-white pb-20">
          <PageBody maxWidth="4xl">
            <div className="px-4 pt-4">
              <button
                onClick={() => navigate(-1)}
                className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back to Dashboard</span>
              </button>
            </div>
            <PrerequisiteGate feature="create a campaign">
              <DropScreen
                onSubmit={submitInput}
                isExtracting={isExtracting}
                extractionMessages={extractionMessages}
                prefillValue={briefPrefill}
                onInspirationChange={handleInspirationChange}
                onInspirationScrolled={handleInspirationScrolled}
              />
            </PrerequisiteGate>
          </PageBody>
          <MobileBottomNav userRole={navRole} />
        </div>
      );
    }
    return (
      <DashboardLayout userRole={navRole}>
        <PageBody maxWidth="4xl">
          <PrerequisiteGate feature="create a campaign">
            <DropScreen
              onSubmit={submitInput}
              isExtracting={isExtracting}
              extractionMessages={extractionMessages}
              prefillValue={briefPrefill}
              onInspirationChange={handleInspirationChange}
              onInspirationScrolled={handleInspirationScrolled}
            />
          </PrerequisiteGate>
        </PageBody>
      </DashboardLayout>
    );
  }

  const launchpadProps = {
    ideas: campaignIdeas || [],
    selectedIdeaId,
    editedCampaign,
    brandFields,
    userRole,
    isExtracting,
    extractionMessages,
    isAuthenticated,
    isLaunching,
    groupTarget: groupId,
    onGroupTargetChange: setGroupId,
    onSelectIdea: selectIdea,
    onRegenerate: regenerateIdeas,
    updateField,
    updateBrandField,
    onLaunch: handleLaunchCampaign,
    onSaveDraft: saveDraft,
    onAuthRequired: () => setShowAuthModal(true),
  };

  // Screen 2: Mobile
  if (isMobile) {
    return (
      <div className="min-h-screen bg-white pt-4 pb-20">
        <PageBody>
          <PrerequisiteGate feature="create a campaign">
            <LaunchpadScreen {...launchpadProps} />
          </PrerequisiteGate>
        </PageBody>
        <AuthenticationModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />
        <MobileBottomNav userRole={navRole} />
      </div>
    );
  }

  // Screen 2: Desktop — always wrapped in DashboardLayout
  return (
    <DashboardLayout userRole={navRole}>
      <PageBody>
        <PrerequisiteGate feature="create a campaign">
          <div className="flex gap-6">
            <div className="flex-1 min-w-0">
              <LaunchpadScreen {...launchpadProps} />
            </div>
            {editedCampaign && (
              <div className="w-80 flex-shrink-0 hidden md:block">
                <CampaignPreviewCard campaign={editedCampaign} />
              </div>
            )}
          </div>
        </PrerequisiteGate>
      </PageBody>
      <AuthenticationModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />
    </DashboardLayout>
  );
}
