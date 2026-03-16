import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { CampaignAnalysis } from '@/types/campaign';
import { useAnonymousCampaign } from './useAnonymousCampaign';

export const useAnonymousCampaignWizard = () => {
  const {
    campaignData,
    createNewCampaign,
    updateCampaignGoal,
    updateCampaignStep,
    updateCampaignAnalysis,
    updateCustomizedData,
    updateTimelineBudgetData,
  } = useAnonymousCampaign();

  const [isGenerating, setIsGenerating] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);

  const currentStep = campaignData?.step || 1;
  const campaignGoal = campaignData?.goal || '';
  const campaignAnalysis = campaignData?.analysis || null;
  const customizedCampaign = campaignData?.customizedData || null;
  
  // Combine all data for the finalize step
  const finalCampaignData = campaignData?.timelineBudgetData ? {
    // Use customized data if available, otherwise fall back to analysis data
    title: customizedCampaign?.title || campaignAnalysis?.title || '',
    description: customizedCampaign?.description || campaignAnalysis?.description || '',
    goals: customizedCampaign?.goals || campaignAnalysis?.goals || [],
    deliverables: customizedCampaign?.content_types || campaignAnalysis?.content_types || [],
    platforms: customizedCampaign?.platforms || campaignAnalysis?.recommended_platforms || [],
    style: customizedCampaign?.style || '',
    tone: customizedCampaign?.tone || '',
    target_audience: customizedCampaign?.target_audience || campaignAnalysis?.target_audience || '',
    key_messages: customizedCampaign?.key_messages || campaignAnalysis?.key_messages || [],
    // Timeline and budget data - map to correct property names
    budgetMin: campaignData.timelineBudgetData.budgetMin || campaignData.timelineBudgetData.budget_min || 500,
    budgetMax: campaignData.timelineBudgetData.budgetMax || campaignData.timelineBudgetData.budget_max || 2000,
    deadline: campaignData.timelineBudgetData.deadline ? new Date(campaignData.timelineBudgetData.deadline) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // Default to 30 days from now
  } : null;

  // Debug logging
  console.log('Debug - useAnonymousCampaignWizard:', {
    currentStep,
    campaignData: campaignData ? 'exists' : 'null',
    timelineBudgetData: campaignData?.timelineBudgetData ? 'exists' : 'null',
    finalCampaignData: finalCampaignData ? 'exists' : 'null',
    hasAnalysis: !!campaignAnalysis,
    hasCustomized: !!customizedCampaign
  });

  const setCampaignGoal = (goal: string) => {
    updateCampaignGoal(goal);
  };

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
      updateCampaignAnalysis(data.analysis);
      toast.success('Campaign analysis generated successfully!');

    } catch (error) {
      console.error('Error generating campaign analysis:', error);
      toast.error(error.message || 'Failed to generate campaign analysis. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleEditCampaignIdea = () => {
    updateCampaignStep(1);
  };

  const handleApproveAndCustomize = () => {
    updateCampaignStep(3);
  };

  const handleBackToAnalysis = () => {
    updateCampaignStep(2);
  };

  const handleContinueFromCustomize = (data: any) => {
    updateCustomizedData(data);
    updateCampaignStep(4);
  };

  const handleBackToCustomize = () => {
    updateCampaignStep(3);
  };

  const handleContinueFromTimelineBudget = (data: any) => {
    updateTimelineBudgetData(data);
  };

  const handleBackToTimelineBudget = () => {
    updateCampaignStep(4);
  };

  const handleBack = () => {
    if (currentStep > 1) {
      updateCampaignStep(currentStep - 1);
    }
  };

  const handlePublishAttempt = () => {
    setShowAuthModal(true);
  };

  const handleSaveDraftAttempt = () => {
    setShowAuthModal(true);
  };

  return {
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
  };
};