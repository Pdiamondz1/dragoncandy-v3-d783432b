import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { CampaignAnalysis } from '@/types/campaign';
import { DeliveryType } from '@/components/campaigns/DeliveryTypeSelector';
import type { ContentSource, StagedFile, Deliverable } from '@/types/campaignMedia';

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
  // Full AI analysis for persistence
  aiAnalysis?: CampaignAnalysis;
  // New fields for 4-step flow
  contentSource?: ContentSource;
  structuredDeliverables?: Deliverable[];
  draftCampaignId?: string;
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

  // Delivery tier state
  const [deliveryTier, setDeliveryTier] = useState<DeliveryType>('standard');
  const [deliveryFee, setDeliveryFee] = useState(0);

  // New state for 4-step flow
  const [contentSource, setContentSource] = useState<ContentSource>('creator_shoots');
  const [referenceMedia, setReferenceMedia] = useState<StagedFile[]>([]);
  const [rawFootage, setRawFootage] = useState<StagedFile[]>([]);
  const [deliverables, setDeliverables] = useState<Deliverable[]>([
    { id: crypto.randomUUID(), content_type: 'video_reel', platform: 'instagram', aspect_ratio: '9:16' }
  ]);
  const [draftCampaignId, setDraftCampaignId] = useState<string | null>(null);

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
      setCurrentStep(1); // Step 1: Details (was Step 2 in old 6-step flow)
      toast.success('Campaign analysis generated successfully!');

    } catch (error: any) {
      console.error('Error generating campaign analysis:', error);
      toast.error(error.message || 'Failed to generate campaign analysis. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  // Save current state as a draft campaign
  const handleSaveAsDraft = async () => {
    if (draftCampaignId) return draftCampaignId; // Already saved

    try {
      const title = customizedCampaign?.title || campaignAnalysis?.title || 'Untitled Campaign';
      const description = customizedCampaign?.description || campaignAnalysis?.description || '';

      const { data: campaign, error } = await supabase
        .from('campaigns')
        .insert({
          user_id: user!.id,
          title,
          description,
          goals: customizedCampaign?.goals ?
            (Array.isArray(customizedCampaign.goals) ? customizedCampaign.goals.join('. ') : customizedCampaign.goals) : '',
          deliverables: deliverables.map(d => `${d.content_type} - ${d.platform}`),
          platforms: customizedCampaign?.platforms || campaignAnalysis?.recommended_platforms || [],
          style: customizedCampaign?.style || '',
          tone: customizedCampaign?.tone || '',
          status: 'draft' as any,
          content_source: contentSource,
          ai_preview_status: 'none',
          delivery_type: deliveryTier,
          delivery_fee: deliveryFee,
          ...(campaignAnalysis ? { ai_analysis: campaignAnalysis as any } : {}),
        } as any)
        .select('id')
        .single();

      if (error) throw error;
      setDraftCampaignId(campaign.id);
      return campaign.id;
    } catch (error: any) {
      toast.error('Failed to save draft: ' + (error.message || 'Unknown error'));
      return null;
    }
  };

  // Save draft and move to AI Preview step
  const handleContinueToPreview = async () => {
    const campaignId = await handleSaveAsDraft();
    if (campaignId) {
      setCurrentStep(2); // AI Preview step
    }
  };

  // Legacy handlers kept for backward compatibility with current wizard page
  const handleContinueFromDeliveryTier = (tier: DeliveryType, fee: number) => {
    setDeliveryTier(tier);
    setDeliveryFee(fee);
    setCurrentStep(1); // Move to Campaign Goal
  };

  const handleBackToDeliveryTier = () => {
    setCurrentStep(0);
  };

  const handleEditCampaignIdea = () => {
    setCurrentStep(0); // Back to Brief (Step 0)
  };

  const handleApproveAndCustomize = () => {
    setCurrentStep(1); // Stay on Details (Step 1) in new flow
  };

  const handleBackToAnalysis = () => {
    setCurrentStep(1); // Details step in new flow
  };

  const handleContinueFromCustomize = (data: any) => {
    setCustomizedCampaign(data);
    setCurrentStep(1); // Stay on Details or move to Preview
  };

  const handleBackToCustomize = () => {
    setCurrentStep(1); // Details step in new flow
  };

  const handleContinueFromTimelineBudget = (data: TimelineBudgetData) => {
    console.log('Timeline & Budget data received:', data);
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
      // Persist the full AI analysis
      aiAnalysis: campaignAnalysis || undefined,
      // New fields
      contentSource,
      structuredDeliverables: deliverables,
      draftCampaignId: draftCampaignId || undefined,
    };

    console.log('Final campaign data prepared:', finalData);
    setFinalCampaignData(finalData);
    setCurrentStep(3); // Review & Launch (Step 3)
  };

  // Combined handler for moving from Details to AI Preview
  const handleContinueFromDetails = async () => {
    await handleContinueToPreview();
  };

  const handleBackToTimelineBudget = () => {
    setCurrentStep(1); // Back to Details
  };

  const handleBack = () => {
    if (currentStep > 0) {
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
    // Delivery tier state
    deliveryTier,
    deliveryFee,
    // New state for 4-step flow
    contentSource,
    setContentSource,
    referenceMedia,
    setReferenceMedia,
    rawFootage,
    setRawFootage,
    deliverables,
    setDeliverables,
    draftCampaignId,
    // Legacy handlers (kept for backward compatibility)
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
    // New handlers for 4-step flow
    handleSaveAsDraft,
    handleContinueToPreview,
    handleContinueFromDetails,
  };
};
