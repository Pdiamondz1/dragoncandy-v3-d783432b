import React from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { CampaignWizardHeader } from '@/components/campaigns/CampaignWizardHeader';
import { BrandCampaignBriefStep } from '@/components/brand-campaigns/BrandCampaignBriefStep';
import { BrandCampaignDetailsStep } from '@/components/brand-campaigns/BrandCampaignDetailsStep';
import { BrandCampaignPreviewStep } from '@/components/brand-campaigns/BrandCampaignPreviewStep';
import { BrandCampaignReviewStep } from '@/components/brand-campaigns/BrandCampaignReviewStep';
import { useBrandCampaignWizard } from '@/hooks/useBrandCampaignWizard';

const BrandCreateCampaign: React.FC = () => {
  const navigate = useNavigate();
  const {
    currentStep,
    setCurrentStep,
    briefData,
    setBriefData,
    detailsData,
    setDetailsData,
    isGenerating,
    campaignAnalysis,
    draftCampaignId,
    handleGenerateAnalysis,
    handleSaveDraft,
    handleBack,
  } = useBrandCampaignWizard();

  const steps = [
    { number: 1, title: 'Brief', active: currentStep >= 1 },
    { number: 2, title: 'Details', active: currentStep >= 2 },
    { number: 3, title: 'Preview', active: currentStep >= 3 },
    { number: 4, title: 'Launch', active: currentStep >= 4 },
  ];

  return (
    <DashboardLayout userRole="brand">
      <div className="min-h-screen bg-white overflow-x-hidden w-full max-w-full">
        {/* Header */}
        <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center">
          <button
            onClick={() => currentStep > 1 ? handleBack() : navigate('/dashboard/brand')}
            className="text-dc-pink-accent mr-2"
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="flex-1 text-center font-sans text-base font-bold text-gray-900 uppercase tracking-wide">
            Create Sponsorship Campaign
          </h1>
          <span className="text-xs text-gray-400 font-semibold">
            {currentStep}/{steps.length}
          </span>
        </div>

        {/* Content */}
        <div className="px-4 py-6 pb-28 md:pb-6 space-y-6 md:max-w-3xl md:mx-auto">
          <CampaignWizardHeader currentStep={currentStep} steps={steps} />

          {/* Step 1: Brief */}
          {currentStep === 1 && (
            <BrandCampaignBriefStep
              briefData={briefData}
              onBriefDataChange={setBriefData}
              onGenerateAnalysis={handleGenerateAnalysis}
              isGenerating={isGenerating}
              hasAnalysis={!!campaignAnalysis}
              onNext={() => setCurrentStep(2)}
            />
          )}

          {/* Step 2: Details */}
          {currentStep === 2 && (
            <BrandCampaignDetailsStep
              detailsData={detailsData}
              onDetailsDataChange={setDetailsData}
              onContinue={() => setCurrentStep(3)}
              onBack={() => setCurrentStep(1)}
            />
          )}

          {/* Step 3: AI Visual Preview */}
          {currentStep === 3 && (
            <BrandCampaignPreviewStep
              onSaveDraft={handleSaveDraft}
              draftCampaignId={draftCampaignId}
              onApprove={() => setCurrentStep(4)}
              onSkip={() => setCurrentStep(4)}
              onBack={() => setCurrentStep(2)}
            />
          )}

          {/* Step 4: Review & Launch */}
          {currentStep === 4 && (
            <BrandCampaignReviewStep
              briefData={briefData}
              detailsData={detailsData}
              campaignAnalysis={campaignAnalysis}
              draftCampaignId={draftCampaignId}
              onBack={() => setCurrentStep(3)}
              onJumpToStep={setCurrentStep}
            />
          )}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default BrandCreateCampaign;
