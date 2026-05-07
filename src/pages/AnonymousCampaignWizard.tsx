import React from 'react';
import { Brain } from 'lucide-react';
import { CampaignAnalysisDisplay } from '@/components/campaigns/CampaignAnalysisDisplay';
import { CampaignCustomizeForm } from '@/components/campaigns/CampaignCustomizeForm';
import { CampaignWizardHeader } from '@/components/campaigns/CampaignWizardHeader';
import { CampaignGoalStep } from '@/components/campaigns/CampaignGoalStep';
import { CampaignWizardSidebar } from '@/components/campaigns/CampaignWizardSidebar';
import { CampaignTimelineBudgetStep } from '@/components/campaigns/CampaignTimelineBudgetStep';
import { AnonymousCampaignLayout } from '@/components/campaigns/AnonymousCampaignLayout';
import { AnonymousCampaignFinalizeStep } from '@/components/campaigns/AnonymousCampaignFinalizeStep';
import { AuthenticationModal } from '@/components/auth/AuthenticationModal';
import { useAnonymousCampaignWizard } from '@/hooks/useAnonymousCampaignWizard';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { toast } from 'sonner';

const AnonymousCampaignWizard: React.FC = () => {
  const {
    currentStep,
    campaignGoal,
    setCampaignGoal,
    isGenerating,
    campaignAnalysis,
    customizedCampaign,
    finalCampaignData,
    showAuthModal,
    setShowAuthModal,
    handleGenerateWithAI,
    handleEditCampaignIdea,
    handleApproveAndCustomize,
    handleBackToAnalysis,
    handleContinueFromCustomize,
    handleBackToCustomize,
    handleContinueFromTimelineBudget,
    handleBackToTimelineBudget,
    handlePublishAttempt,
    handleSaveDraftAttempt,
  } = useAnonymousCampaignWizard();

  const { isAuthenticated, profile, migrateCampaignData } = useAuth();
  const navigate = useNavigate();

  // Redirect authenticated users based on role and migrate/clear anonymous data
  useEffect(() => {
    if (!isAuthenticated || !profile) return;

    const hasAnon = !!localStorage.getItem('anonymous_campaign_data') || !!localStorage.getItem('anonymous_campaign_final');

    if (profile.role === 'business_client') {
      if (hasAnon) {
        migrateCampaignData().finally(() => {
          toast.success('Your campaign was saved to your account.');
          navigate('/dashboard/business/campaigns');
        });
      } else {
        navigate('/dashboard/business/campaigns/create');
      }
    } else {
      if (hasAnon) {
        localStorage.removeItem('anonymous_campaign_data');
        localStorage.removeItem('anonymous_campaign_final');
        toast.message('Campaign creation is for business clients. Browse campaigns instead.');
      }
      navigate('/dashboard/creator/campaigns');
    }
  }, [isAuthenticated, profile, migrateCampaignData, navigate]);

  const steps = [
    { number: 1, title: 'Campaign Goal', active: true },
    { number: 2, title: 'AI Analysis', active: false },
    { number: 3, title: 'Customize', active: false },
    { number: 4, title: 'Timeline & Budget', active: false },
    { number: 5, title: 'Finalize', active: false },
  ];

  const handleAuthSuccess = () => {
    setShowAuthModal(false);
  };

  return (
    <AnonymousCampaignLayout currentStep={currentStep} totalSteps={5}>
      {/* Template C inner content */}
      <div className="py-6 pb-10 space-y-6">
        <CampaignWizardHeader currentStep={currentStep} steps={steps} />

        {/* Step 1: Campaign Goal */}
        {currentStep === 1 && (
          <div className="space-y-4">
            <CampaignGoalStep
              campaignGoal={campaignGoal}
              setCampaignGoal={setCampaignGoal}
              onGenerateWithAI={handleGenerateWithAI}
              isGenerating={isGenerating}
            />
            <CampaignWizardSidebar />
          </div>
        )}

        {/* Step 2: AI Analysis Results */}
        {currentStep === 2 && campaignAnalysis && (
          <div className="space-y-4">
            <div className="border-2 border-dc-teal rounded-2xl p-4 bg-white">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 bg-gray-900 rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0">
                  2
                </div>
                <div>
                  <span className="font-bold text-gray-900 text-sm">Step 2: AI Campaign Analysis</span>
                  <Brain className="h-4 w-4 text-dc-teal inline ml-2" aria-hidden="true" />
                </div>
              </div>
              <p className="text-gray-500 text-xs mt-2">
                DragonCandy AI has analyzed your campaign goal and generated a comprehensive strategy
              </p>
            </div>
            <CampaignAnalysisDisplay
              analysis={campaignAnalysis}
              onEditCampaignIdea={handleEditCampaignIdea}
              onApproveAndCustomize={handleApproveAndCustomize}
            />
          </div>
        )}

        {/* Step 3: Customize Campaign */}
        {currentStep === 3 && campaignAnalysis && (
          <CampaignCustomizeForm
            initialData={campaignAnalysis}
            onContinue={handleContinueFromCustomize}
            onBackToAnalysis={handleBackToAnalysis}
          />
        )}

        {/* Step 4: Timeline & Budget */}
        {currentStep === 4 && (
          <CampaignTimelineBudgetStep
            deliveryTier="standard"
            deliveryFee={0}
            initialData={{
              goals: customizedCampaign ? (
                Array.isArray(customizedCampaign.goals)
                  ? customizedCampaign.goals.join('. ') + '.'
                  : customizedCampaign.goals || ''
              ) : campaignAnalysis ? (
                Array.isArray(campaignAnalysis.goals)
                  ? campaignAnalysis.goals.join('. ') + '.'
                  : ''
              ) : '',
              deadline: undefined,
              budget_min: customizedCampaign?.budget_min || campaignAnalysis?.budget_recommendations?.min,
              budget_max: customizedCampaign?.budget_max || campaignAnalysis?.budget_recommendations?.max,
            }}
            onContinue={handleContinueFromTimelineBudget}
            onBackToCustomize={handleBackToCustomize}
          />
        )}

        {/* Step 5: Finalize - Anonymous Version */}
        {currentStep === 5 && (
          <>
            {finalCampaignData ? (
              <AnonymousCampaignFinalizeStep
                campaignData={finalCampaignData}
                onBack={handleBackToTimelineBudget}
                onPublishAttempt={handlePublishAttempt}
                onSaveDraftAttempt={handleSaveDraftAttempt}
              />
            ) : (
              <div className="text-center py-12 bg-white rounded-2xl border-2 border-dc-teal">
                <h3 className="font-sans text-base font-bold text-gray-900 uppercase tracking-wide mb-3">
                  Complete Previous Steps
                </h3>
                <p className="text-gray-500 text-sm mb-6">
                  Please complete the timeline and budget step to continue.
                </p>
                <button
                  onClick={handleBackToTimelineBudget}
                  className="w-full rounded-full bg-dc-teal-btn text-white font-bold py-3"
                >
                  Go Back to Timeline &amp; Budget
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Authentication Modal */}
      <AuthenticationModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onSuccess={handleAuthSuccess}
      />
    </AnonymousCampaignLayout>
  );
};

export default AnonymousCampaignWizard;
