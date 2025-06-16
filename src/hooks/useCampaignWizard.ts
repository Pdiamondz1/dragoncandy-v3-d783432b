
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

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

export const useCampaignWizard = () => {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);
  const [campaignGoal, setCampaignGoal] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [campaignAnalysis, setCampaignAnalysis] = useState<CampaignAnalysis | null>(null);
  const [customizedCampaign, setCustomizedCampaign] = useState<CampaignAnalysis | null>(null);
  const [timelineBudgetData, setTimelineBudgetData] = useState<TimelineBudgetData | null>(null);

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

  return {
    currentStep,
    campaignGoal,
    setCampaignGoal,
    isGenerating,
    campaignAnalysis,
    customizedCampaign,
    timelineBudgetData,
    handleGenerateWithAI,
    handleEditCampaignIdea,
    handleApproveAndCustomize,
    handleBackToAnalysis,
    handleContinueFromCustomize,
    handleBackToCustomize,
    handleContinueFromTimelineBudget,
    handleNext,
    handleBack,
  };
};
