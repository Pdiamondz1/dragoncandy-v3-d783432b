import React from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import CampaignCustomizeForm from '@/components/campaigns/CampaignCustomizeForm';
import CampaignWizardHeader from '@/components/campaigns/CampaignWizardHeader';
import CampaignTimelineBudgetStep from '@/components/campaigns/CampaignTimelineBudgetStep';
import CampaignFinalizeStep from '@/components/campaigns/CampaignFinalizeStep';
import CampaignBriefStep from '@/components/campaigns/CampaignBriefStep';
import DeliveryTierStep from '@/components/campaigns/DeliveryTierStep';
import CampaignVisualsStep from '@/components/campaigns/CampaignVisualsStep';
import { useCampaignWizard } from '@/hooks/useCampaignWizard';

const CampaignWizard: React.FC = () => {
  const navigate = useNavigate();
  const {
    currentStep,
    setCurrentStep,
    campaignGoal,
    setCampaignGoal,
    isGenerating,
    campaignAnalysis,
    customizedCampaign,
    setCustomizedCampaign,
    finalCampaignData,
    deliveryTier,
    deliveryFee,
    contentSource,
    setContentSource,
    referenceMedia,
    setReferenceMedia,
    rawFootage,
    setRawFootage,
    deliverables,
    setDeliverables,
    handleGenerateWithAI,
    handleContinueFromTimelineBudget,
    handleBack,
    handleTierSelect,
    handleContinueFromVisuals,
  } = useCampaignWizard();

  const steps = [
    { number: 1, title: 'Speed', active: true },
    { number: 2, title: 'Brief', active: false },
    { number: 3, title: 'Details', active: false },
    { number: 4, title: 'Visuals', active: false },
    { number: 5, title: 'Review', active: false },
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
        <div className="px-4 py-6 pb-28 space-y-6 md:max-w-3xl md:mx-auto">
          <CampaignWizardHeader currentStep={currentStep} steps={steps} />

          {/* Step 0: Delivery Tier */}
          {currentStep === 0 && (
            <DeliveryTierStep
              selectedTier={deliveryTier}
              onSelect={handleTierSelect}
              onContinue={() => setCurrentStep(1)}
            />
          )}

          {/* Step 1: Brief */}
          {currentStep === 1 && (
            <CampaignBriefStep
              campaignGoal={campaignGoal}
              setCampaignGoal={setCampaignGoal}
              contentSource={contentSource}
              setContentSource={setContentSource}
              referenceMedia={referenceMedia}
              setReferenceMedia={setReferenceMedia}
              rawFootage={rawFootage}
              setRawFootage={setRawFootage}
              onGenerateWithAI={handleGenerateWithAI}
              isGenerating={isGenerating}
              hasAnalysis={!!campaignAnalysis}
              onNext={() => {
                if (campaignAnalysis) {
                  setCurrentStep(2);
                }
              }}
            />
          )}

          {/* Step 2: Details */}
          {currentStep === 2 && campaignAnalysis && (
            <div className="space-y-6">
              <CampaignCustomizeForm
                initialData={campaignAnalysis}
                onContinue={(data) => {
                  setCustomizedCampaign(data);
                }}
                onBackToAnalysis={() => setCurrentStep(1)}
              />

              <CampaignTimelineBudgetStep
                deliveryTier={deliveryTier!}
                deliveryFee={deliveryFee}
                initialData={{
                  goals: Array.isArray(customizedCampaign?.goals)
                    ? customizedCampaign.goals.join('. ')
                    : customizedCampaign?.goals || '',
                  deadline: undefined,
                  budget_min: undefined,
                  budget_max: undefined,
                }}
                onContinue={handleContinueFromTimelineBudget}
                onBackToCustomize={() => setCurrentStep(1)}
              />
            </div>
          )}

          {/* Step 3: Visuals & Footage */}
          {currentStep === 3 && (
            <CampaignVisualsStep
              deliveryTier={deliveryTier!}
              referenceMedia={referenceMedia}
              onReferenceMediaChange={setReferenceMedia}
              rawFootage={rawFootage}
              onRawFootageChange={setRawFootage}
              deliverables={deliverables}
              onDeliverablesChange={setDeliverables}
              onContinue={handleContinueFromVisuals}
              onBack={() => setCurrentStep(2)}
            />
          )}

          {/* Step 4: Review & Launch */}
          {currentStep === 4 && finalCampaignData && (
            <CampaignFinalizeStep
              campaignData={finalCampaignData}
              onBack={() => setCurrentStep(3)}
            />
          )}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default CampaignWizard;
