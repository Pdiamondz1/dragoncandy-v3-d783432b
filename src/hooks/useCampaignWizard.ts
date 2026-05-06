import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { CampaignAnalysis } from '@/types/campaign';
import type { DeliveryTier } from '@/types/campaignMedia';
import { TIER_LIMITS } from '@/types/campaignMedia';
import type { ContentSource, StagedFile, Deliverable } from '@/types/campaignMedia';
import { mapDeliveryTierToDb } from '@/lib/campaignUtils';

export interface TimelineBudgetData {
  goals: string;
  deadline: Date;
  deliveryType: DeliveryTier;
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
  deliveryType: DeliveryTier;
  deliveryFee: number;
  pricingType: 'fixed' | 'bid_range';
  fixedPrice?: number;
  budgetMin?: number;
  budgetMax?: number;
  // Full AI analysis for persistence
  aiAnalysis?: CampaignAnalysis;
  // New fields for 5-step flow
  contentSource?: ContentSource;
  structuredDeliverables?: Deliverable[];
  draftCampaignId?: string;
}

export const useCampaignWizard = () => {
  const { user } = useAuth();
  useNavigate();
  const [currentStep, setCurrentStep] = useState(1);
  const [campaignGoal, setCampaignGoal] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [campaignAnalysis, setCampaignAnalysis] = useState<CampaignAnalysis | null>(null);
  const [customizedCampaign, setCustomizedCampaign] = useState<Partial<CampaignAnalysis> | null>(null);
  const [timelineBudgetData, setTimelineBudgetData] = useState<TimelineBudgetData | null>(null);
  const [finalCampaignData, setFinalCampaignData] = useState<FinalCampaignData | null>(null);

  // Delivery tier state
  const [deliveryTier, setDeliveryTier] = useState<DeliveryTier | null>(null);
  const [deliveryFee, setDeliveryFee] = useState(0);

  // New state for 5-step flow
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
      setCurrentStep(3); // Step 3: Details (Brief is Step 2, so after AI generation go to Step 3)
      toast.success('Campaign analysis generated successfully!');

    } catch (error: unknown) {
      console.error('Error generating campaign analysis:', error);
      const message = error instanceof Error ? error.message : 'Failed to generate campaign analysis. Please try again.';
      toast.error(message);
    } finally {
      setIsGenerating(false);
    }
  };

  // Tier selection handler — gates deliverables to tier limits
  const handleTierSelect = (tier: DeliveryTier) => {
    setDeliveryTier(tier);
    setDeliveryFee(TIER_LIMITS[tier].fee);

    const maxDel = TIER_LIMITS[tier].maxDeliverables;
    const trimmed = deliverables.length > maxDel;
    const capped = trimmed ? deliverables.slice(0, maxDel) : deliverables;

    // Filter out content types not allowed by new tier
    const allowedTypes = TIER_LIMITS[tier].contentTypes as readonly string[];
    const filtered = capped.map(d =>
      allowedTypes.includes(d.content_type) ? d : { ...d, content_type: TIER_LIMITS[tier].contentTypes[0] }
    );

    setDeliverables(filtered);
    if (trimmed) {
      toast.info(`Reduced to ${maxDel} deliverables for ${TIER_LIMITS[tier].label}`);
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
          status: 'draft',
          content_source: contentSource,
          ai_preview_status: 'none',
          delivery_type: deliveryTier ? mapDeliveryTierToDb(deliveryTier) : undefined,
          delivery_fee: deliveryFee,
          ...(campaignAnalysis ? { ai_analysis: campaignAnalysis as unknown as Record<string, unknown> } : {}),
        })
        .select('id')
        .single();

      if (error) throw error;
      setDraftCampaignId(campaign.id);
      return campaign.id;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      toast.error('Failed to save draft: ' + message);
      return null;
    }
  };

  const handleContinueFromTimelineBudget = (data: TimelineBudgetData) => {
    setTimelineBudgetData(data);
    setCurrentStep(4); // Go to Visuals step (Step 4)
  };

  const handleContinueFromVisuals = () => {
    if (!timelineBudgetData) return;

    const finalData: FinalCampaignData = {
      title: customizedCampaign?.title || campaignAnalysis?.title || '',
      description: customizedCampaign?.description || campaignAnalysis?.description || '',
      goals: timelineBudgetData.goals,
      deliverables: customizedCampaign?.content_types || campaignAnalysis?.content_types || [],
      platforms: customizedCampaign?.platforms || campaignAnalysis?.recommended_platforms || [],
      style: customizedCampaign?.style || '',
      tone: customizedCampaign?.tone || '',
      deadline: timelineBudgetData.deadline,
      deliveryType: deliveryTier!,
      deliveryFee: deliveryFee,
      pricingType: timelineBudgetData.pricingType,
      fixedPrice: timelineBudgetData.fixedPrice,
      budgetMin: timelineBudgetData.budgetMin,
      budgetMax: timelineBudgetData.budgetMax,
      aiAnalysis: campaignAnalysis || undefined,
      contentSource,
      structuredDeliverables: deliverables,
      draftCampaignId: draftCampaignId || undefined,
    };

    setFinalCampaignData(finalData);
    setCurrentStep(5); // Review & Launch
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  return {
    currentStep,
    setCurrentStep,
    campaignGoal,
    setCampaignGoal,
    isGenerating,
    campaignAnalysis,
    customizedCampaign,
    setCustomizedCampaign,
    timelineBudgetData,
    setTimelineBudgetData,
    finalCampaignData,
    setFinalCampaignData,
    // Delivery tier state
    deliveryTier,
    setDeliveryTier,
    deliveryFee,
    // New state for 5-step flow
    contentSource,
    setContentSource,
    referenceMedia,
    setReferenceMedia,
    rawFootage,
    setRawFootage,
    deliverables,
    setDeliverables,
    draftCampaignId,
    // Handlers
    handleGenerateWithAI,
    handleTierSelect,
    handleContinueFromTimelineBudget,
    handleContinueFromVisuals,
    handleBack,
    handleSaveAsDraft,
  };
};
