import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useCampaignCreator } from '@/hooks/useCampaignCreator';
import { useIsMobile } from '@/hooks/use-mobile';
import { DropScreen } from '@/components/campaign-creator/DropScreen';
import { LaunchpadScreen } from '@/components/campaign-creator/LaunchpadScreen';
import { CampaignPreviewCard } from '@/components/campaign-creator/CampaignPreviewCard';
import { AuthenticationModal } from '@/components/auth/AuthenticationModal';
import { MobileBottomNav } from '@/components/MobileBottomNav';
import { DashboardLayout } from '@/components/DashboardLayout';

export default function CampaignCreator() {
  const [showAuthModal, setShowAuthModal] = useState(false);
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const {
    screen, isExtracting, extractionMessages, campaignIdeas, selectedIdeaId,
    editedCampaign, brandFields, userRole, isAuthenticated, isLaunching,
    submitInput, selectIdea, regenerateIdeas, updateField, updateBrandField,
    launchCampaign, saveDraft,
  } = useCampaignCreator();

  const navRole = userRole || 'business_client';

  if (screen === 'drop') {
    if (isMobile) {
      return (
        <div className="min-h-screen bg-white pb-20">
          <div className="absolute top-6 left-6 z-10">
            <button
              onClick={() => navigate(-1)}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Dashboard</span>
            </button>
          </div>
          <DropScreen onSubmit={submitInput} isExtracting={isExtracting} extractionMessages={extractionMessages} />
          <MobileBottomNav userRole={navRole} />
        </div>
      );
    }
    return (
      <DashboardLayout userRole={navRole}>
        <DropScreen onSubmit={submitInput} isExtracting={isExtracting} extractionMessages={extractionMessages} />
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
    onSelectIdea: selectIdea,
    onRegenerate: regenerateIdeas,
    updateField,
    updateBrandField,
    onLaunch: launchCampaign,
    onSaveDraft: saveDraft,
    onAuthRequired: () => setShowAuthModal(true),
  };

  // Screen 2: Mobile
  if (isMobile) {
    return (
      <div className="min-h-screen bg-white pt-4 pb-20">
        <LaunchpadScreen {...launchpadProps} />
        <AuthenticationModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />
        <MobileBottomNav userRole={navRole} />
      </div>
    );
  }

  // Screen 2: Desktop — always wrapped in DashboardLayout
  return (
    <DashboardLayout userRole={navRole}>
      <div className="flex gap-6 max-w-6xl mx-auto">
        <div className="flex-1 min-w-0">
          <LaunchpadScreen {...launchpadProps} />
        </div>
        {editedCampaign && (
          <div className="w-80 flex-shrink-0 hidden md:block">
            <CampaignPreviewCard campaign={editedCampaign} />
          </div>
        )}
      </div>
      <AuthenticationModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />
    </DashboardLayout>
  );
}
