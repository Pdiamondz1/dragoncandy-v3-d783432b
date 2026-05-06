import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAnonymousCampaign, type AnonymousCustomizedData, type AnonymousTimelineBudgetData } from './useAnonymousCampaign';
import { CampaignData } from '@/types/campaign';

export const useAnonymousCampaignWizard = () => {
  const {
    campaignData,
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
  const rawGoals = customizedCampaign?.goals || campaignAnalysis?.goals || [];
  const goalsString = Array.isArray(rawGoals) ? rawGoals.join('. ') : String(rawGoals);

  const finalCampaignData = campaignData?.timelineBudgetData ? {
    // Use customized data if available, otherwise fall back to analysis data
    title: customizedCampaign?.title || campaignAnalysis?.title || '',
    description: customizedCampaign?.description || campaignAnalysis?.description || '',
    goals: goalsString,
    deliverables: customizedCampaign?.content_types || campaignAnalysis?.content_types || [],
    platforms: customizedCampaign?.platforms || campaignAnalysis?.recommended_platforms || [],
    style: customizedCampaign?.style || '',
    tone: customizedCampaign?.tone || '',
    // Timeline and budget data - map to correct property names
    budgetMin: campaignData.timelineBudgetData.budgetMin || campaignData.timelineBudgetData.budget_min || 500,
    budgetMax: campaignData.timelineBudgetData.budgetMax || campaignData.timelineBudgetData.budget_max || 2000,
    deadline: campaignData.timelineBudgetData.deadline ? new Date(campaignData.timelineBudgetData.deadline) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // Default to 30 days from now
  } : null;

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
      const { data, error } = await supabase.functions.invoke('generate-campaign-analysis', {
        body: { campaignGoal }
      });

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

      updateCampaignAnalysis(data.analysis);
      toast.success('Campaign analysis generated successfully!');

    } catch (error) {
      console.error('Error generating campaign analysis:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to generate campaign analysis. Please try again.');
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

  const handleContinueFromCustomize = (data: CampaignData) => {
    const customized: AnonymousCustomizedData = {
      title: data.title,
      description: data.description,
      goals: data.goals,
      platforms: data.platforms,
      content_types: data.content_types,
      target_audience: data.target_audience,
      key_messages: data.key_messages,
    };
    updateCustomizedData(customized);
    updateCampaignStep(4);
  };

  const handleBackToCustomize = () => {
    updateCampaignStep(3);
  };

  const handleContinueFromTimelineBudget = (data: { goals: string; deadline: Date; deliveryType: string; deliveryFee: number; pricingType: string; fixedPrice?: number; budgetMin?: number; budgetMax?: number }) => {
    const timelineBudget: AnonymousTimelineBudgetData = {
      goals: data.goals,
      deadline: data.deadline.toISOString(),
      deliveryType: data.deliveryType,
      deliveryFee: data.deliveryFee,
      pricingType: data.pricingType,
      fixedPrice: data.fixedPrice,
      budgetMin: data.budgetMin,
      budgetMax: data.budgetMax,
    };
    updateTimelineBudgetData(timelineBudget);
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