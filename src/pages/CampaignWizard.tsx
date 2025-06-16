import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Brain } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import CampaignAnalysisDisplay from '@/components/campaigns/CampaignAnalysisDisplay';
import CampaignCustomizeForm from '@/components/campaigns/CampaignCustomizeForm';
import CampaignWizardHeader from '@/components/campaigns/CampaignWizardHeader';
import CampaignGoalStep from '@/components/campaigns/CampaignGoalStep';
import CampaignWizardSidebar from '@/components/campaigns/CampaignWizardSidebar';
import CampaignTimelineBudgetStep from '@/components/campaigns/CampaignTimelineBudgetStep';

interface CampaignAnalysis {
  title: string;
  description: string;
  goals: string;
  targetAudience: string;
  platforms: string[];
  timeline: string;
  style: string;
  tone: string;
  deliverables: string[];
  budgetRecommendation: string;
}

interface TimelineBudgetData {
  goals: string;
  deadline: Date;
  budgetMin: number;
  budgetMax: number;
}

const CampaignWizard: React.FC = () => {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);
  const [campaignGoal, setCampaignGoal] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [campaignAnalysis, setCampaignAnalysis] = useState<CampaignAnalysis | null>(null);
  const [customizedCampaign, setCustomizedCampaign] = useState<CampaignAnalysis | null>(null);
  const [timelineBudgetData, setTimelineBudgetData] = useState<TimelineBudgetData | null>(null);

  const steps = [
    { number: 1, title: 'Campaign Goal', active: true },
    { number: 2, title: 'AI Analysis', active: false },
    { number: 3, title: 'Customize', active: false },
    { number: 4, title: 'Timeline & Budget', active: false },
    { number: 5, title: 'Finalize', active: false },
  ];

  const handleGenerateWithAI = async () => {
    if (!campaignGoal.trim()) {
      toast({
        title: 'Campaign goal required',
        description: 'Please describe your campaign goal before generating analysis.',
        variant: 'destructive',
      });
      return;
    }

    setIsGenerating(true);
    
    try {
      console.log('Calling generate-campaign-analysis function...');
      const { data, error } = await supabase.functions.invoke('generate-campaign-analysis', {
        body: { campaignGoal: campaignGoal.trim() }
      });

      if (error) {
        console.error('Supabase function error:', error);
        throw error;
      }

      console.log('Campaign analysis result:', data);
      setCampaignAnalysis(data);
      setCurrentStep(2);
      
      toast({
        title: 'Campaign analysis complete!',
        description: 'DragonCandy AI has analyzed your campaign goal.',
      });
    } catch (error) {
      console.error('Error generating campaign analysis:', error);
      toast({
        title: 'Analysis failed',
        description: 'Unable to generate campaign analysis. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleEditCampaignIdea = () => {
    setCurrentStep(1);
  };

  const handleApproveAndCustomize = () => {
    setCurrentStep(3);
  };

  const handleBackToAnalysis = () => {
    setCurrentStep(2);
  };

  const handleContinueFromCustomize = (customizedData: CampaignAnalysis) => {
    setCustomizedCampaign(customizedData);
    setCurrentStep(4);
    toast({
      title: 'Campaign customized!',
      description: 'Ready to set timeline and budget.',
    });
  };

  const handleBackToCustomize = () => {
    setCurrentStep(3);
  };

  const handleContinueFromTimelineBudget = (data: TimelineBudgetData) => {
    setTimelineBudgetData(data);
    setCurrentStep(5);
    toast({
      title: 'Timeline and budget set!',
      description: 'Ready to finalize your campaign.',
    });
  };

  const handleNext = () => {
    if (currentStep < 5) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    } else {
      navigate('/dashboard/business/campaigns');
    }
  };

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
                goals: customizedCampaign.goals,
                deadline: undefined,
                budget_min: undefined,
                budget_max: undefined,
              }}
              onContinue={handleContinueFromTimelineBudget}
              onBackToCustomize={handleBackToCustomize}
            />
          )}

          {/* Step 5: Finalize (Placeholder) */}
          {currentStep === 5 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-gray-900 rounded-full flex items-center justify-center text-white text-sm font-semibold">
                    5
                  </div>
                  Step 5: Finalize Campaign
                </CardTitle>
                <p className="text-gray-600 text-sm">
                  Coming soon - Review and publish your campaign
                </p>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600">Final review and campaign publishing will be implemented in the next step.</p>
              </CardContent>
            </Card>
          )}

          {/* Navigation */}
          <div className="flex justify-between mt-8">
            <Button variant="outline" onClick={handleBack}>
              {currentStep === 1 ? 'Back to Campaigns' : 'Previous Step'}
            </Button>
            
            {currentStep === 5 && (
              <Button onClick={handleNext} disabled={currentStep >= 5}>
                Create Campaign
              </Button>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default CampaignWizard;
