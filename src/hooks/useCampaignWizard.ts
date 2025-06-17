import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { CampaignAnalysis } from '@/types/campaign';

export const useCampaignWizard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);
  const [campaignGoal, setCampaignGoal] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [campaignAnalysis, setCampaignAnalysis] = useState<CampaignAnalysis | null>(null);
  const [customizedCampaign, setCustomizedCampaign] = useState<any>(null);
  const [finalCampaignData, setFinalCampaignData] = useState<any>(null);

  const handleGenerateWithAI = async () => {
    if (!campaignGoal.trim()) {
      toast.error('Please enter your campaign goal');
      return;
    }

    setIsGenerating(true);
    
    try {
      console.log('Calling generate-campaign-analysis with goal:', campaignGoal);
      
      const { data, error } = await supabase.functions.invoke('generate-campaign-analysis', {
        body: { campaignGoal }
      });

      console.log('Supabase function response:', { data, error });

      if (error) {
        console.error('Supabase function error:', error);
        throw new Error(error.message || 'Failed to generate campaign analysis');
      }

      if (!data) {
        throw new Error('No data returned from campaign analysis');
      }

      if (!data.success) {
        throw new Error(data.error || 'Campaign analysis generation failed');
      }

      if (!data.analysis) {
        throw new Error('No analysis data in response');
      }

      console.log('Campaign analysis generated successfully:', data.analysis);
      setCampaignAnalysis(data.analysis);
      setCurrentStep(2);
      toast.success('Campaign analysis generated successfully!');

    } catch (error) {
      console.error('Error generating campaign analysis:', error);
      toast.error(error.message || 'Failed to generate campaign analysis. Please try again.');
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

  const handleContinueFromCustomize = (data: any) => {
    setCustomizedCampaign(data);
    setCurrentStep(4);
  };

  const handleBackToCustomize = () => {
    setCurrentStep(3);
  };

  const handleContinueFromTimelineBudget = (data: any) => {
    setFinalCampaignData(data);
    setCurrentStep(5);
  };

  const handleBackToTimelineBudget = () => {
    setCurrentStep(4);
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  return {
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
  };
};
