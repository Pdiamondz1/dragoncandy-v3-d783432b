
import React from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Brain } from 'lucide-react';
import CampaignAnalysisDisplay from '@/components/campaigns/CampaignAnalysisDisplay';
import CampaignCustomizeForm from '@/components/campaigns/CampaignCustomizeForm';
import CampaignWizardHeader from '@/components/campaigns/CampaignWizardHeader';
import CampaignGoalStep from '@/components/campaigns/CampaignGoalStep';
import CampaignWizardSidebar from '@/components/campaigns/CampaignWizardSidebar';
import CampaignTimelineBudgetStep from '@/components/campaigns/CampaignTimelineBudgetStep';
import CampaignFinalizeStep from '@/components/campaigns/CampaignFinalizeStep';
import { useCampaignWizard } from '@/hooks/useCampaignWizard';

const CampaignWizard: React.FC = () => {
  const {
    currentStep,
    campaignGoal,
    setCampaignGoal,
    isGenerating,
    campaignAnalysis,
    customizedCampaign,
    finalCampaignData,
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
    { number: 1, title: 'Campaign Goal', active: true },
    { number: 2, title: 'AI Analysis', active: false },
    { number: 3, title: 'Customize', active: false },
    { number: 4, title: 'DragonDash', active: false },
    { number: 5, title: 'Finalize', active: false },
  ];

  return (
    <DashboardLayout userRole="business_client">
      <div className="flex-1 p-6 bg-gray-50">
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
          {currentStep === 4 && customizedCampaign && (
            <CampaignTimelineBudgetStep
              initialData={{
                goals: Array.isArray(customizedCampaign.goals) 
                  ? customizedCampaign.goals.join('. ') + '.'
                  : customizedCampaign.goals || '',
                deadline: undefined,
                budget_min: undefined,
                budget_max: undefined,
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
