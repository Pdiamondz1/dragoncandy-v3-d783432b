import React from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import CampaignCustomizeForm from '@/components/campaigns/CampaignCustomizeForm';
import CampaignWizardHeader from '@/components/campaigns/CampaignWizardHeader';
import CampaignWizardSidebar from '@/components/campaigns/CampaignWizardSidebar';
import CampaignTimelineBudgetStep from '@/components/campaigns/CampaignTimelineBudgetStep';
import CampaignFinalizeStep from '@/components/campaigns/CampaignFinalizeStep';
import CampaignBriefStep from '@/components/campaigns/CampaignBriefStep';
import CampaignAIPreviewStep from '@/components/campaigns/CampaignAIPreviewStep';
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
    draftCampaignId,
    handleGenerateWithAI,
    handleContinueFromTimelineBudget,
    handleContinueToPreview,
    handleBack,
  } = useCampaignWizard();

  const steps = [
    { number: 1, title: 'Brief', active: true },
    { number: 2, title: 'Details', active: false },
    { number: 3, title: 'AI Preview', active: false },
    { number: 4, title: 'Review', active: false },
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
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-gray-900 rounded-full flex items-center justify-center text-white text-sm font-semibold">2</div>
                    Campaign Details
                  </CardTitle>
                  <p className="text-gray-500 text-sm">Review and customize your AI-generated campaign</p>
                </CardHeader>
              </Card>

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

              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setCurrentStep(0)} className="rounded-full">
                  Back
                </Button>
                <Button
                  className="flex-1 bg-dc-teal hover:bg-dc-teal/90 text-white rounded-full"
                  onClick={handleContinueToPreview}
                >
                  Continue to AI Preview
                </Button>
              </div>
            </div>
          )}

          {/* Step 2: AI Preview */}
          {currentStep === 2 && draftCampaignId && (
            <CampaignAIPreviewStep
              campaignId={draftCampaignId}
              onApprove={() => setCurrentStep(3)}
              onSkip={() => setCurrentStep(3)}
              onBack={() => setCurrentStep(1)}
            />
          )}

          {/* Step 3: Review & Launch */}
          {currentStep === 3 && finalCampaignData && (
            <CampaignFinalizeStep
              campaignData={finalCampaignData}
              onBack={() => setCurrentStep(2)}
            />
          )}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default CampaignWizard;
