import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import type { CampaignAnalysis } from '@/types/campaign';
import type { StagedFile, Deliverable } from '@/types/campaignMedia';

export type BrandGoal = 'awareness' | 'conversions' | 'ugc_volume' | 'launch_hype';
export type GeographicScope = 'city' | 'region' | 'national';
export type CreatorPersona =
  | 'lifestyle' | 'foodie' | 'fitness' | 'beauty'
  | 'tech' | 'travel' | 'fashion' | 'parenting'
  | 'gaming' | 'comedy';

export interface BrandBriefData {
  campaignName: string;
  tagline: string;
  brandGoal: BrandGoal | '';
  targetPersonas: CreatorPersona[];
  platforms: string[];
  geographicScope: GeographicScope | '';
  campaignVision: string;
}

export interface BrandDetailsData {
  budgetMin: number;
  budgetMax: number;
  perCreatorCap: number;
  creatorCount: number;
  deliverables: Deliverable[];
  brandAssets: StagedFile[];
  hashtagRequirements: string;
  usageRightsDays: number; // 0 = perpetual
  exclusivityDays: number;
}

export interface BrandFinalData {
  brief: BrandBriefData;
  details: BrandDetailsData;
  deadline: Date;
  aiAnalysis?: CampaignAnalysis;
  draftCampaignId?: string;
}

export const useBrandCampaignWizard = () => {
  const { user } = useAuth();
  const [currentStep, setCurrentStep] = useState(1);
  const [isGenerating, setIsGenerating] = useState(false);
  const [campaignAnalysis, setCampaignAnalysis] = useState<CampaignAnalysis | null>(null);
  const [draftCampaignId, setDraftCampaignId] = useState<string | null>(null);

  // Step 1: Brief
  const [briefData, setBriefData] = useState<BrandBriefData>({
    campaignName: '',
    tagline: '',
    brandGoal: '',
    targetPersonas: [],
    platforms: [],
    geographicScope: '',
    campaignVision: '',
  });

  // Step 2: Details
  const [detailsData, setDetailsData] = useState<BrandDetailsData>({
    budgetMin: 0,
    budgetMax: 0,
    perCreatorCap: 0,
    creatorCount: 5,
    deliverables: [
      { id: crypto.randomUUID(), content_type: 'video_reel', platform: 'instagram', aspect_ratio: '9:16' },
    ],
    brandAssets: [],
    hashtagRequirements: '',
    usageRightsDays: 30,
    exclusivityDays: 0,
  });

  const handleGenerateAnalysis = async () => {
    if (!briefData.campaignVision.trim()) {
      toast.error('Please describe your campaign vision');
      return;
    }

    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-campaign-analysis', {
        body: {
          campaignGoal: `Brand sponsorship campaign: "${briefData.campaignName}" - ${briefData.tagline}. Goal: ${briefData.brandGoal}. Target personas: ${briefData.targetPersonas.join(', ')}. Geographic scope: ${briefData.geographicScope}. Vision: ${briefData.campaignVision}`,
        },
      });

      if (error) throw new Error(error.message || 'Failed to generate campaign analysis');
      if (!data?.success || !data?.analysis) throw new Error('No analysis data returned');

      setCampaignAnalysis(data.analysis);
      toast.success('Campaign analysis generated!');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to generate analysis';
      toast.error(message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveDraft = async (): Promise<string | null> => {
    if (!user) return null;
    if (draftCampaignId) return draftCampaignId;

    try {
      const { data: campaign, error } = await supabase
        .from('campaigns')
        .insert({
          user_id: user.id,
          title: briefData.campaignName || 'Untitled Brand Campaign',
          description: briefData.campaignVision,
          goals: briefData.brandGoal,
          platforms: briefData.platforms,
          status: 'draft' as const,
          campaign_type: 'sponsorship',
          tagline: briefData.tagline || null,
          target_creator_personas: briefData.targetPersonas.length > 0 ? briefData.targetPersonas : null,
          geographic_scope: briefData.geographicScope || null,
          budget_min: detailsData.budgetMin || null,
          budget_max: detailsData.budgetMax || null,
          per_creator_cap: detailsData.perCreatorCap || null,
          creator_count: detailsData.creatorCount || null,
          hashtag_requirements: detailsData.hashtagRequirements || null,
          usage_rights_days: detailsData.usageRightsDays,
          exclusivity_days: detailsData.exclusivityDays || null,
          ai_preview_status: 'none',
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

  const handleBack = () => {
    if (currentStep > 1) setCurrentStep(currentStep - 1);
  };

  return {
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
  };
};
