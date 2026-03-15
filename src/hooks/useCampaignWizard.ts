import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { CampaignAnalysis } from '@/types/campaign';
import { DeliveryType } from '@/components/campaigns/DeliveryTypeSelector';

export interface TimelineBudgetData {
  goals: string;
  deadline: Date;
  deliveryType: 'standard' | 'expedited' | 'dragonrush';
  deliveryFee: number;
  pricingType: 'fixed' | 'bid_range';
  fixedPrice?: number;
  budgetMin?: number;
  budgetMax?: number;
}

export interface FinalCampaignData {
  title: string;
  description: string;
  goals: string;
  deliverables: string[];
  platforms: string[];
  style: string;
  tone: string;
  deadline: Date;
  // DragonDash fields
  deliveryType: 'standard' | 'expedited' | 'dragonrush';
  deliveryFee: number;
  pricingType: 'fixed' | 'bid_range';
  fixedPrice?: number;
  budgetMin?: number;
  budgetMax?: number;
}

export const useCampaignWizard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);
  const [campaignGoal, setCampaignGoal] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [campaignAnalysis, setCampaignAnalysis] = useState<CampaignAnalysis | null>(null);
  const [customizedCampaign, setCustomizedCampaign] = useState<any>(null);
  const [timelineBudgetData, setTimelineBudgetData] = useState<TimelineBudgetData | null>(null);
  const [finalCampaignData, setFinalCampaignData] = useState<FinalCampaignData | null>(null);
  
  // Step 0: Delivery Tier state
  const [deliveryTier, setDeliveryTier] = useState<DeliveryType>('standard');
  const [deliveryFee, setDeliveryFee] = useState(0);

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

      setCampaignAnalysis(data.analysis);
      setCurrentStep(2); // Step 2: AI Analysis
      toast.success('Campaign analysis generated successfully!');

    } catch (error) {
      console.error('Error generating campaign analysis:', error);
      toast.error(error.message || 'Failed to generate campaign analysis. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  // Step 0: Delivery Tier handlers
  const handleContinueFromDeliveryTier = (tier: DeliveryType, fee: number) => {
    setDeliveryTier(tier);
    setDeliveryFee(fee);
    setCurrentStep(1); // Move to Campaign Goal
  };

  const handleBackToDeliveryTier = () => {
    setCurrentStep(0);
  };

  const handleEditCampaignIdea = () => {
    setCurrentStep(1); // Back to Campaign Goal (Step 1)
  };

  const handleApproveAndCustomize = () => {
    setCurrentStep(3); // Move to Customize (Step 3)
  };

  const handleBackToAnalysis = () => {
    setCurrentStep(2); // Back to AI Analysis (Step 2)
  };

  const handleContinueFromCustomize = (data: any) => {
    setCustomizedCampaign(data);
    setCurrentStep(4); // Move to DragonDash (Step 4)
  };

  const handleBackToCustomize = () => {
    setCurrentStep(3); // Back to Customize (Step 3)
  };

  const handleContinueFromTimelineBudget = (data: TimelineBudgetData) => {
    setTimelineBudgetData(data);
    
    // Combine all data for the finalize step
    const finalData: FinalCampaignData = {
      title: customizedCampaign?.title || campaignAnalysis?.title || '',
      description: customizedCampaign?.description || campaignAnalysis?.description || '',
      goals: data.goals,
      deliverables: customizedCampaign?.content_types || campaignAnalysis?.content_types || [],
      platforms: customizedCampaign?.platforms || campaignAnalysis?.recommended_platforms || [],
      style: customizedCampaign?.style || '',
      tone: customizedCampaign?.tone || '',
      deadline: data.deadline,
      // DragonDash fields
      deliveryType: data.deliveryType,
      deliveryFee: data.deliveryFee,
      pricingType: data.pricingType,
      fixedPrice: data.fixedPrice,
      budgetMin: data.budgetMin,
      budgetMax: data.budgetMax,
    };
    
    setFinalCampaignData(finalData);
    setCurrentStep(5); // Move to Finalize (Step 5)
  };

  const handleBackToTimelineBudget = () => {
    setCurrentStep(4); // Back to DragonDash (Step 4)
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
    timelineBudgetData,
    finalCampaignData,
    // Step 0 state
    deliveryTier,
    deliveryFee,
    // Handlers
    handleContinueFromDeliveryTier,
    handleBackToDeliveryTier,
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

