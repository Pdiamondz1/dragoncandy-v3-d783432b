import React from 'react';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Brain } from 'lucide-react';
import CampaignAnalysisDisplay from '@/components/campaigns/CampaignAnalysisDisplay';
import CampaignCustomizeForm from '@/components/campaigns/CampaignCustomizeForm';
import CampaignWizardHeader from '@/components/campaigns/CampaignWizardHeader';
import CampaignGoalStep from '@/components/campaigns/CampaignGoalStep';
import CampaignWizardSidebar from '@/components/campaigns/CampaignWizardSidebar';
import CampaignTimelineBudgetStep from '@/components/campaigns/CampaignTimelineBudgetStep';
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
    handleBack,
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
    // Close modal; redirect will be handled by the auth effect above once profile is loaded
    setShowAuthModal(false);
  };

  return (
    <AnonymousCampaignLayout currentStep={currentStep} totalSteps={5}>
      <div className="flex-1 p-6">
        <div className="max-w-4xl mx-auto">
          <CampaignWizardHeader currentStep={currentStep} steps={steps} />

          {/* Step 1: Campaign Goal */}
          {currentStep === 1 && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <CampaignGoalStep
                  campaignGoal={campaignGoal}
                  setCampaignGoal={setCampaignGoal}
                  onGenerateWithAI={handleGenerateWithAI}
                  isGenerating={isGenerating}
                />
              </div>
              <CampaignWizardSidebar />
            </div>
          )}

          {/* Step 2: AI Analysis Results */}
          {currentStep === 2 && campaignAnalysis && (
            <div>
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-gray-900 rounded-full flex items-center justify-center text-white text-sm font-semibold">
                      2
                    </div>
                    Step 2: AI Campaign Analysis
                    <Brain className="h-5 w-5 text-blue-500 ml-2" />
                  </CardTitle>
                  <p className="text-gray-600 text-sm">
                    DragonCandy AI has analyzed your campaign goal and generated a comprehensive strategy
                  </p>
                </CardHeader>
              </Card>
              
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
                <div className="text-center py-12">
                  <h3 className="text-lg font-semibold mb-4">Complete Previous Steps</h3>
                  <p className="text-gray-600 mb-6">
                    Please complete the timeline and budget step to continue.
                  </p>
                  <button
                    onClick={handleBackToTimelineBudget}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    Go Back to Timeline & Budget
                  </button>
                </div>
              )}
            </>
          )}
        </div>
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