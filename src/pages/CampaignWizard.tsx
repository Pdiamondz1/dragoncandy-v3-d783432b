import React from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import CampaignCustomizeForm from '@/components/campaigns/CampaignCustomizeForm';
import CampaignWizardHeader from '@/components/campaigns/CampaignWizardHeader';
import CampaignTimelineBudgetStep from '@/components/campaigns/CampaignTimelineBudgetStep';
import CampaignFinalizeStep from '@/components/campaigns/CampaignFinalizeStep';
import CampaignBriefStep from '@/components/campaigns/CampaignBriefStep';

import DeliverableBuilder from '@/components/campaigns/DeliverableBuilder';
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
  } = useCampaignWizard();

  const steps = [
    { number: 1, title: 'Brief', active: true },
    { number: 2, title: 'Details', active: false },
    { number: 3, title: 'Review', active: false },
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

          {/* Step 0: Brief */}
          {currentStep === 0 && (
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
                  setCurrentStep(1);
                }
              }}
            />
          )}

          {/* Step 1: Details */}
          {currentStep === 1 && campaignAnalysis && (
            <div className="space-y-6">
              <CampaignCustomizeForm
                initialData={campaignAnalysis}
                onContinue={(data) => {
                  setCustomizedCampaign(data);
                }}
                onBackToAnalysis={() => setCurrentStep(0)}
              />

              <DeliverableBuilder
                deliverables={deliverables}
                onChange={setDeliverables}
              />

              <CampaignTimelineBudgetStep
                initialData={{
                  goals: Array.isArray(customizedCampaign?.goals)
                    ? customizedCampaign.goals.join('. ')
                    : customizedCampaign?.goals || '',
                  deadline: undefined,
                  budget_min: undefined,
                  budget_max: undefined,
                  delivery_type: deliveryTier,
                  delivery_fee: deliveryFee,
                }}
                onContinue={handleContinueFromTimelineBudget}
                onBackToCustomize={() => setCurrentStep(0)}
              />

            </div>
          )}

          {/* Step 2: Review & Launch */}
          {currentStep === 2 && finalCampaignData && (
            <CampaignFinalizeStep
              campaignData={finalCampaignData}
              onBack={() => setCurrentStep(1)}
            />
          )}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default CampaignWizard;
