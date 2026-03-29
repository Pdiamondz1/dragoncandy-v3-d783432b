import React from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { Brain, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import CampaignAnalysisDisplay from '@/components/campaigns/CampaignAnalysisDisplay';
import CampaignCustomizeForm from '@/components/campaigns/CampaignCustomizeForm';
import CampaignWizardHeader from '@/components/campaigns/CampaignWizardHeader';
import CampaignGoalStep from '@/components/campaigns/CampaignGoalStep';
import CampaignWizardSidebar from '@/components/campaigns/CampaignWizardSidebar';
import CampaignTimelineBudgetStep from '@/components/campaigns/CampaignTimelineBudgetStep';
import CampaignFinalizeStep from '@/components/campaigns/CampaignFinalizeStep';
import DeliveryTierStep from '@/components/campaigns/DeliveryTierStep';
import { useCampaignWizard } from '@/hooks/useCampaignWizard';

const CampaignWizard: React.FC = () => {
  const navigate = useNavigate();
  const {
    currentStep,
    campaignGoal,
    setCampaignGoal,
    isGenerating,
    campaignAnalysis,
    customizedCampaign,
    finalCampaignData,
    deliveryTier,
    deliveryFee,
    handleContinueFromDeliveryTier,
    handleGenerateWithAI,
    handleEditCampaignIdea,
    handleApproveAndCustomize,
    handleBackToAnalysis,
    handleContinueFromCustomize,
    handleBackToCustomize,
    handleContinueFromTimelineBudget,
    handleBackToTimelineBudget,
    handleBack,
  } = useCampaignWizard();

  const steps = [
    { number: 1, title: 'Delivery', active: true },
    { number: 2, title: 'Campaign Goal', active: false },
    { number: 3, title: 'AI Analysis', active: false },
    { number: 4, title: 'Customize', active: false },
    { number: 5, title: 'DragonDash', active: false },
    { number: 6, title: 'Finalize', active: false },
  ];

  return (
    <DashboardLayout userRole="business_client">
      <div className="min-h-screen bg-white overflow-x-hidden w-full max-w-full">
        {/* Template C Header */}
        <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center">
          <button
            onClick={() => currentStep > 0 ? handleBack() : navigate('/dashboard/business/campaigns')}
            className="text-dc-pink-accent mr-2"
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="flex-1 text-center font-sans text-base font-bold text-gray-900 uppercase tracking-wide">
            Create Campaign
          </h1>
          <span className="text-xs text-gray-400 font-semibold">
            {currentStep + 1}/{steps.length}
          </span>
        </div>

        {/* Content */}
        <div className="px-4 py-6 pb-28 space-y-6">
          <CampaignWizardHeader currentStep={currentStep} steps={steps} />

          {/* Step 0: Delivery Tier */}
          {currentStep === 0 && (
            <DeliveryTierStep
              initialTier={deliveryTier}
              onContinue={handleContinueFromDeliveryTier}
            />
          )}

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
              <div className="border-2 border-dc-teal rounded-2xl p-4">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 bg-gray-900 rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0">
                    3
                  </div>
                  <div>
                    <span className="font-bold text-gray-900 text-sm">Step 3: AI Campaign Analysis</span>
                    <Brain className="h-4 w-4 text-dc-teal inline ml-2" />
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

          {/* Step 4: Timeline & Budget (DragonDash) */}
          {currentStep === 4 && customizedCampaign && (
            <CampaignTimelineBudgetStep
              initialData={{
                goals: Array.isArray(customizedCampaign.goals)
                  ? customizedCampaign.goals.join('. ') + '.'
                  : customizedCampaign.goals || '',
                deadline: undefined,
                budget_min: undefined,
                budget_max: undefined,
                delivery_type: deliveryTier,
                delivery_fee: deliveryFee,
              }}
              onContinue={handleContinueFromTimelineBudget}
              onBackToCustomize={handleBackToCustomize}
            />
          )}

          {/* Step 5: Finalize */}
          {currentStep === 5 && finalCampaignData && (
            <CampaignFinalizeStep
              campaignData={finalCampaignData}
              onBack={handleBackToTimelineBudget}
            />
          )}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default CampaignWizard;
